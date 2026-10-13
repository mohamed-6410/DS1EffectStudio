using SoulsFormats;
using System.Collections;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Security.Cryptography;

System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
var game = Arg("--game") ?? @"E:\Games\Dark Souls Prepare to Die Edition\DATA";
var store = new GameStore(game);
var sounds = new SoundLibrary(Path.Combine(game,"sound"));
if (args.Contains("--audit")) { Console.WriteLine(JsonSerializer.Serialize(store.Audit(), Graph.Options)); return; }
if (args.Contains("--dump")) {
    var a = Arg("--archive") ?? store.Common;
    Console.WriteLine(JsonSerializer.Serialize(store.Effect(a, int.Parse(Arg("--id") ?? "90000")), Graph.Options)); return;
}
var contentRoot=Directory.Exists(Path.Combine(AppContext.BaseDirectory,"wwwroot"))?AppContext.BaseDirectory:Directory.GetCurrentDirectory();
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args=args,ContentRootPath=contentRoot });
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.WebHost.ConfigureKestrel(o=>o.Limits.MaxRequestBodySize=40*1024*1024);
builder.WebHost.UseUrls("http://127.0.0.1:" + (Arg("--port") ?? "5187"));
builder.Services.ConfigureHttpJsonOptions(o => { o.SerializerOptions.NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals; });
var app = builder.Build();
app.Use(async (ctx, next) => {
    if (ctx.Request.Headers.Origin.Count > 0 && !ctx.Request.Headers.Origin.ToString().StartsWith("http://127.0.0.1:")) { ctx.Response.StatusCode=403; return; }
    try { await next(); }
    catch (Exception e) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { error = e.Message }); }
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapGet("/api/catalog", () => store.Catalog());
app.MapGet("/api/effect", (string archive, int id) => store.Effect(archive, id));
app.MapGet("/api/model", (string archive, string name) => store.Model(archive, name));
app.MapGet("/api/texture", (string archive, string name) => Results.File(store.Texture(archive, name), "application/octet-stream"));
app.MapGet("/api/resources", (string archive) => store.Resources(archive));
app.MapPost("/api/export-ffx", (ExportRequest request) => Results.File(store.Export(request),"application/octet-stream",$"f{request.Id:D7}.ffx"));
app.MapPost("/api/import-asset", (AssetImport request) => store.Import(request));
app.MapPost("/api/export-archive", (ExportRequest request) => Results.File(store.ExportArchive(request),"application/octet-stream",request.Archive));
app.MapGet("/api/sounds", () => sounds.Catalog());
app.MapGet("/api/audio", async (string bank,int sample) => Results.File(await sounds.Decode(bank,sample),"audio/wav"));
app.MapGet("/api/health", () => new { ready = true, game, archives = store.Archives.Count });
app.MapPost("/api/shutdown", () => { app.Lifetime.StopApplication(); return Results.Ok(new{stopped=true}); });
Console.WriteLine($"DS1 Effect Studio — {game}\nOpen http://127.0.0.1:5187");
app.Run();
string? Arg(string name) { int i = Array.IndexOf(args,name); return i >= 0 && i+1 < args.Length ? args[i+1] : null; }

sealed class GameStore {
    public Dictionary<string, Archive> Archives = new(StringComparer.OrdinalIgnoreCase);
    public string Common => Archives.Keys.FirstOrDefault(x=>x.Equals("FRPG_SfxBnd_CommonEffects.ffxbnd",StringComparison.OrdinalIgnoreCase)) ?? Archives.Keys.FirstOrDefault(x=>x.Contains("CommonEffects",StringComparison.OrdinalIgnoreCase)) ?? Archives.Keys.First();
    public GameStore(string path) {
        string dir = Path.Combine(path,"sfx");
        if(!Directory.Exists(dir)) throw new DirectoryNotFoundException("No sfx folder at " + dir);
        foreach(var file in Directory.GetFiles(dir,"*.ffxbnd*")) {
            if(!file.EndsWith(".ffxbnd",StringComparison.OrdinalIgnoreCase) && !file.EndsWith(".ffxbnd.dcx",StringComparison.OrdinalIgnoreCase)) continue;
            var b = BND3.Read(file);
            Archives[Path.GetFileName(file)] = new Archive(file,b.Files);
        }
        if(Archives.Count==0) throw new InvalidDataException("No PTDE effect archives found.");
    }
    Archive Get(string a) => Archives.TryGetValue(a,out var v) ? v : throw new KeyNotFoundException("Unknown archive");
    public object Catalog() => new { game = Path.GetDirectoryName(Get(Common).Path), common = Common, archives = Archives.Select(k=>new {name=k.Key,effects=k.Value.Effects.Keys.Order().Select(id=>new {id,name=$"f{id:D7}",bytes=k.Value.Effects[id].Bytes.Length}),textures=k.Value.Tpfs.Count,models=k.Value.Models.Count}) };
    public object Effect(string a,int id) {
        var ar=Get(a); if(!ar.Effects.TryGetValue(id,out var entry)) { ar=Get(Common); if(!ar.Effects.TryGetValue(id,out entry)) throw new KeyNotFoundException("Effect ID absent: " + id); }
        var fx=FXR1.Read(entry.Bytes);
        var graph=new Graph();
        var root=graph.Encode(fx.RootFXNode);
        var actions=fx.AllFXActionDatas.Select(x=>graph.Encode(x)).ToArray();
        return new {id,archive=a,bigEndian=fx.BigEndian,wide=fx.Wide,bytes=entry.Bytes.Length,sha256=Convert.ToHexString(SHA256.HashData(entry.Bytes)),header=Convert.ToHexString(entry.Bytes.Take(32).ToArray()),root,objects=graph.Objects,actions,states=fx.AllStates.Count,transitions=fx.AllTransitions.Count};
    }
    (Archive, BinderFile) Asset(string a,string name,bool model) {
        string key=Path.GetFileNameWithoutExtension(name.Replace('\\','/')).ToLowerInvariant();
        foreach(var ar in new[]{Get(a),Get(Common)}.Distinct()) {
            var dict=model?ar.Models:ar.Tpfs; if(dict.TryGetValue(key,out var v)) return(ar,v);
            if(!model) { ar.IndexTextures(); if(ar.TextureFiles.TryGetValue(key,out var t)) return(ar,t); }
        }
        throw new KeyNotFoundException((model?"Model":"Texture") + " not found: " + name);
    }
    public byte[] Texture(string a,string name) {
        var (ar,file)=Asset(a,name,false); var tpf=TPF.Read(file.Bytes);
        string key=Path.GetFileNameWithoutExtension(name).ToLowerInvariant();
        var tex=tpf.Textures.FirstOrDefault(t=>t.Name.Equals(key,StringComparison.OrdinalIgnoreCase)) ?? tpf.Textures.First();
        return tex.Bytes;
    }
    public object Resources(string a) => new { textures=Get(a).Tpfs.Keys.Order(),models=Get(a).Models.Keys.Order() };
    public object Import(AssetImport request) {
        if(request.Id<0||request.Id>99999)throw new InvalidDataException("Resource ID must be 0–99999");
        var ar=Get(request.Archive);var bytes=Convert.FromBase64String(request.Data);
        if(bytes.Length==0||bytes.Length>24*1024*1024)throw new InvalidDataException("Asset must be under 24 MB");
        var ext=Path.GetExtension(request.Name).ToLowerInvariant();bool model=ext==".flver";string key=$"s{request.Id:D5}";
        if(model){var f=FLVER2.Read(bytes);if(f.Header.Version!=FLVER2.Read(Get(Common).Models.Values.First().Bytes).Header.Version)throw new InvalidDataException("Use a PTDE FLVER with the same version as the game models");if(f.Meshes.Count==0)throw new InvalidDataException("Model has no meshes");}
        else if(ext==".tpf"){var tpf=TPF.Read(bytes);if(tpf.Platform!=TPF.TPFPlatform.PC||tpf.Textures.Count!=1)throw new InvalidDataException("Import a PC TPF containing one effect texture");ValidateDds(tpf.Textures[0].Bytes);tpf.Textures[0].Name=key;bytes=tpf.Write();}
        else if(ext==".dds"){ValidateDds(bytes);var tpf=new TPF{Encoding=2,Flag2=3};var four=System.Text.Encoding.ASCII.GetString(bytes,84,4);tpf.Textures.Add(new TPF.Texture(key,(byte)(four=="DXT1"?0:5),0,bytes,TPF.TPFPlatform.PC));bytes=tpf.Write();}
        else throw new InvalidDataException("Choose a native FLVER, single-texture PC TPF or DXT1/DXT5 DDS");
        var dict=model?ar.Models:ar.Tpfs;var source=dict.GetValueOrDefault(key)??(model?Get(Common).Models:Get(Common).Tpfs).Values.First();
        string folder=source.Name[..(Math.Max(source.Name.LastIndexOf('/'),source.Name.LastIndexOf('\\'))+1)];
        var file=new BinderFile(source.Flags,source.ID,folder+key+(model?".flver":".tpf"),bytes);dict[key]=file;ar.Imported[key+(model?".flver":".tpf")]=file;ar.Reindex();
        return new{key,id=request.Id,kind=model?"models":"textures",bytes=bytes.Length};
    }
    static void ValidateDds(byte[] b){if(b.Length<128||System.Text.Encoding.ASCII.GetString(b,0,4)!="DDS ")throw new InvalidDataException("Invalid DDS header");string f=System.Text.Encoding.ASCII.GetString(b,84,4);if(f is not "DXT1" and not "DXT5")throw new InvalidDataException("Preview imports currently support DXT1 and DXT5");var d=new DDS(b);if(d.dwWidth<1||d.dwHeight<1||d.dwWidth>8192||d.dwHeight>8192||d.dwCaps2.HasFlag(DDS.DDSCAPS2.CUBEMAP)||d.dwCaps2.HasFlag(DDS.DDSCAPS2.VOLUME))throw new InvalidDataException("Use a 2D texture up to 8192 pixels");int size=checked((int)((d.dwWidth+3)/4*((d.dwHeight+3)/4)*(f=="DXT1"?8:16)));if(b.Length<128+size)throw new InvalidDataException("DDS pixel data is truncated");}
    public byte[] ExportArchive(ExportRequest request){var ar=Get(request.Archive);var b=BND3.Read(ar.Path);var edited=Export(request);var effect=b.Files.FirstOrDefault(f=>Path.GetFileName(f.Name.Replace('\\','/')).Equals($"f{request.Id:D7}.ffx",StringComparison.OrdinalIgnoreCase))??throw new InvalidDataException("This effect belongs to CommonEffects; export its own archive");effect.Bytes=edited;
        foreach(var entry in ar.Imported.Values){var existing=b.Files.FirstOrDefault(f=>Path.GetFileName(f.Name.Replace('\\','/')).Equals(Path.GetFileName(entry.Name),StringComparison.OrdinalIgnoreCase));if(existing!=null)existing.Bytes=entry.Bytes;else {int category=entry.Name.EndsWith(".tpf")?100000:200000;int id=b.Files.Where(f=>f.ID>=category&&f.ID<category+100000).Select(f=>f.ID).DefaultIfEmpty(category-1).Max()+1;if(id>=category+100000||b.Files.Any(f=>f.ID==id))throw new InvalidDataException("No free binder resource ID");b.Files.Add(new BinderFile(entry.Flags,id,entry.Name,entry.Bytes));}}
        b.Files.Sort((left,right)=>left.ID.CompareTo(right.ID));
        var bytes=b.Write();var reread=BND3.Read(bytes);if(reread.Files.Count!=b.Files.Count||b.Files.Zip(reread.Files).Any(p=>p.First.ID!=p.Second.ID||p.First.Name!=p.Second.Name||!p.First.Bytes.SequenceEqual(p.Second.Bytes)))throw new InvalidDataException("Archive round-trip validation failed");return bytes;}
    public byte[] Export(ExportRequest request) {
        var ar=Get(request.Archive);if(!ar.Effects.TryGetValue(request.Id,out var entry))ar=Get(Common);
        if(!ar.Effects.TryGetValue(request.Id,out entry))throw new InvalidDataException("Original effect absent");
        if(!Convert.ToHexString(SHA256.HashData(entry.Bytes)).Equals(request.Sha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("The source changed; reload before exporting.");
        if(request.Edits.Count>10000)throw new InvalidDataException("Too many edits");
        var fx=FXR1.Read(entry.Bytes);
        foreach(var edit in request.Edits){
            object? value=fx.AllFXActionDatas.FirstOrDefault(x=>x.XID==edit.Target);
            if(value==null){value=fx.AllFXNodes.Cast<FXR1.XIDable>().Concat(fx.AllModifiers).FirstOrDefault(x=>x.XID==edit.Target);string kind=value?.GetType().Name??"";var allowed=kind switch{"TickNode"=>new[]{"Tick"},"Tick2Node"=>new[]{"Tick1","Tick2"},"IntNode"=>new[]{"Value"},"Int2Node"=>new[]{"X","Y"},"SoundIDNode68" or "SoundIDNode69"=>new[]{"SoundID"},"FXModifier2_SetLifetime"=>new[]{"Lifetime","Unk2","Unk3","Unk4"},"FXModifier6_SetLifetimeB"=>new[]{"Unk1"},_=>Array.Empty<string>()};if(edit.Path.Length!=1||!allowed.Contains(edit.Path[0]))throw new InvalidDataException("Unsupported graph edit");}
            if(value==null)throw new InvalidDataException("Unknown parameter target");
            if(edit.Path.Length==0||edit.Path.Length>8||!double.IsFinite(edit.Value))throw new InvalidDataException("Invalid edit");
            for(int i=0;i<edit.Path.Length;i++){
                string part=edit.Path[i];if(part is "ParentContainer" or "XID" or "Type" or "DS1RData"||part.StartsWith("DEBUG"))throw new InvalidDataException("Protected field");
                if(value is IList list){int index=int.Parse(part);if(index<0||index>=list.Count)throw new InvalidDataException("Tick index out of range");value=list[index]??throw new InvalidDataException("Empty tick");continue;}
                var field=value.GetType().GetField(part,BindingFlags.Public|BindingFlags.Instance);
                var prop=value.GetType().GetProperty(part,BindingFlags.Public|BindingFlags.Instance);
                if(i==edit.Path.Length-1){var type=field?.FieldType??prop?.PropertyType??throw new InvalidDataException("Unknown field");
                    if(!new[]{typeof(float),typeof(int),typeof(short),typeof(byte)}.Contains(type))throw new InvalidDataException("Only numeric parameters are editable");
                    if(type!=typeof(float)&&edit.Value!=Math.Truncate(edit.Value))throw new InvalidDataException("Integer field requires a whole number");
                    var converted=Convert.ChangeType(edit.Value,type);if(converted is float fv&&!float.IsFinite(fv))throw new InvalidDataException("Float overflow");
                    if(field!=null)field.SetValue(value,converted);else if(prop?.CanWrite==true)prop.SetValue(value,converted);else throw new InvalidDataException("Read-only field");
                }else value=field?.GetValue(value)??prop?.GetValue(value)??throw new InvalidDataException("Unknown parameter path");
            }
        }
        foreach(var edit in request.Curves??new()){
            var action=fx.AllFXActionDatas.FirstOrDefault(x=>x.XID==edit.Target)??throw new InvalidDataException("Unknown curve target");
            var field=action.GetType().GetField(edit.Field);
            if(field?.GetValue(action) is not FXR1.FXField curve)throw new InvalidDataException("Unknown curve field");
            var ticks=curve.GetType().GetField("Ticks");
            if(ticks?.FieldType!=typeof(List<FXR1.FloatTick>))throw new InvalidDataException("This curve does not support scalar keyframes");
            if(edit.Ticks.Count==0||edit.Ticks.Count>2048||edit.Ticks.Any(t=>!float.IsFinite(t.Time)||!float.IsFinite(t.Value))||edit.Ticks.Zip(edit.Ticks.Skip(1)).Any(p=>p.First.Time>=p.Second.Time))throw new InvalidDataException("Curve times must be finite and strictly increasing");
            ticks.SetValue(curve,edit.Ticks.Select(t=>new FXR1.FloatTick{Time=t.Time,Value=t.Value}).ToList());
        }
        if(request.Sounds?.Count>1000)throw new InvalidDataException("Too many sound insertions");
        foreach(var constant in request.Constants??new()){
            if(!new[]{"RotX","RotY","RotZ","Scale1X","Scale1Y","Scale1Z","ScaleX","ScaleY","ScaleZ","Scale"}.Contains(constant.Field)||!float.IsFinite(constant.Value))throw new InvalidDataException("Unsupported constant override");
            var target=fx.AllFXActionDatas.FirstOrDefault(x=>x.XID==constant.Target)??throw new InvalidDataException("Unknown constant target");var field=target.GetType().GetField(constant.Field);if(field?.FieldType!=typeof(FXR1.FXField))throw new InvalidDataException("Unknown scalar field");field.SetValue(target,new FXR1.FXField.ConstFloat{Value=constant.Value});
        }
        foreach(var insert in request.Sounds??new()){
            if(insert.SoundId<0||insert.SoundId>999999999)throw new InvalidDataException("Invalid sound ID");
            var call=fx.AllFXNodes.OfType<FXR1.FXNode.EffectCallNode>().FirstOrDefault(n=>n.XID==insert.Target)??throw new InvalidDataException("Select an effect-call group for the sound");
            var sound=new FXR1.FXNode.ActionCallNode{ActionType=75,Container=new FXR1.FXContainer{UnkFlag3=1,FXNodes=new(){new FXR1.FXNode.SoundIDNode68{SoundID=insert.SoundId},new FXR1.FXNode.FloatNode{Value=1},new FXR1.FXNode.IntNode{Value=1}}}};call.Container.FXNodes.Add(sound);
        }
        var bytes=fx.Write();if(Graph.Signature(fx)!=Graph.Signature(FXR1.Read(bytes)))throw new InvalidDataException("Export validation failed");
        return bytes;
    }
    public object Model(string a,string name) {
        var (_,file)=Asset(a,name,true); var f=FLVER2.Read(file.Bytes);
        return new {name,version=f.Header.Version,materials=f.Materials.Select(m=>new {m.Name,m.MTD,textures=m.Textures.Select(t=>new {type=t.ParamName,t.Path})}), meshes=f.Meshes.Select(m=>new {
            material=m.MaterialIndex,cullBackfaces=m.FaceSets.FirstOrDefault(s=>(s.Flags & FLVER2.FaceSet.FSFlags.LodLevel1)==0 && (s.Flags & FLVER2.FaceSet.FSFlags.LodLevel2)==0)?.CullBackfaces ?? true,positions=m.Vertices.SelectMany(v=>new[]{v.Position.X,v.Position.Y,v.Position.Z}),
            normals=m.Vertices.SelectMany(v=>new[]{v.Normal.X,v.Normal.Y,v.Normal.Z}),
            uvs=m.Vertices.SelectMany(v=>v.UVs.Count>0?new[]{v.UVs[0].X,v.UVs[0].Y}:new[]{0f,0f}),
            indices=WebIndices(m.FaceSets.FirstOrDefault(s=>(s.Flags & FLVER2.FaceSet.FSFlags.LodLevel1)==0 && (s.Flags & FLVER2.FaceSet.FSFlags.LodLevel2)==0))})};
    }
    static List<int> WebIndices(FLVER2.FaceSet? faces) {
        var indices=faces?.Triangulate(true) ?? new List<int>();
        // PTDE FLVER winding is opposite WebGL's front-face convention in the exported basis.
        for(int i=0;i+2<indices.Count;i+=3)(indices[i+1],indices[i+2])=(indices[i+2],indices[i+1]);
        return indices;
    }
    public object Audit() {
        var errors=new List<object>(); int effects=0,textures=0,models=0,roundtrips=0,byteMatches=0;
        var types=new Dictionary<string,int>(); var formats=new Dictionary<string,int>();
        var report=new List<object>();
        foreach(var (name,ar) in Archives) {
            foreach(var (id,e) in ar.Effects) { try {
                var f=FXR1.Read(e.Bytes); effects++;
                foreach(var x in f.AllFXActionDatas) {var t=x.GetType().Name; types[t]=types.GetValueOrDefault(t)+1;}
                var before=Graph.Signature(f); var written=f.Write(); var reread=FXR1.Read(written);
                if(Graph.Signature(reread)!=before) throw new InvalidDataException("Decoded round trip differs");
                roundtrips++; if(e.Bytes.SequenceEqual(written)) byteMatches++;
            }catch(Exception ex){errors.Add(new{archive=name,kind="effect",id,error=ex.Message});} }
            foreach(var (key,e) in ar.Tpfs) {try{foreach(var t in TPF.Read(e.Bytes).Textures){textures++;string format=t.Bytes.Length>88?System.Text.Encoding.ASCII.GetString(t.Bytes,84,4):"short";formats[format]=formats.GetValueOrDefault(format)+1;}}catch(Exception ex){errors.Add(new{archive=name,kind="texture",key,error=ex.Message});}}
            foreach(var key in ar.Models.Keys) {try{var model=Model(name,key);models++;}catch(Exception ex){errors.Add(new{archive=name,kind="model",key,error=ex.Message});}}
            report.Add(new{name,effects=ar.Effects.Count,textures=ar.Tpfs.Count,models=ar.Models.Count});
        }
        return new{archives=Archives.Count,effects,textures,models,roundtrips,byteMatches,types,formats,errors,report};
    }
}
sealed class Archive {
    public string Path; public Dictionary<int,BinderFile> Effects=new();
    public Dictionary<string,BinderFile> Tpfs=new(StringComparer.OrdinalIgnoreCase), Models=new(StringComparer.OrdinalIgnoreCase),TextureFiles=new(StringComparer.OrdinalIgnoreCase);
    bool indexed;
    public Dictionary<string,BinderFile> Imported=new(StringComparer.OrdinalIgnoreCase);
    public void Reindex(){lock(TextureFiles){TextureFiles.Clear();indexed=false;}}
    public Archive(string path,List<BinderFile> files) { Path=path; foreach(var f in files) {
        string name=System.IO.Path.GetFileName(f.Name.Replace('\\','/')).ToLowerInvariant(); string key=System.IO.Path.GetFileNameWithoutExtension(name);
        if(name.EndsWith(".ffx")&&int.TryParse(key.TrimStart('f'),out int id)) Effects[id]=f;
        if(name.EndsWith(".tpf")) Tpfs[key]=f;
        if(name.EndsWith(".flver")) Models[key]=f;
    }}
    public void IndexTextures() {lock(TextureFiles){if(indexed)return;foreach(var file in Tpfs.Values) foreach(var t in TPF.Read(file.Bytes).Textures) TextureFiles[t.Name]=file;indexed=true;}}
}
sealed class Graph {
    public static JsonSerializerOptions Options=new(){WriteIndented=true,NumberHandling=JsonNumberHandling.AllowNamedFloatingPointLiterals};
    public Dictionary<string,object?> Objects=new();
    Dictionary<object,string> seen=new(ReferenceEqualityComparer.Instance);
    public object? Encode(object? v) {
        if(v==null)return null;var t=v.GetType();
        if(t.IsPrimitive||v is string||v is decimal)return v;
        if(t.IsEnum)return v.ToString();
        if(v is IEnumerable list) return list.Cast<object?>().Select(Encode).ToArray();
        if(v is FXR1.XIDable x) {
            if(seen.TryGetValue(v,out var existing)) return new Dictionary<string,object?>{{"ref",existing}};
            string id=x.XID??"obj"+seen.Count;seen[v]=id;
            var data=new Dictionary<string,object?>{{"kind",t.Name}};Objects[id]=data;
            Fields(v,data);return new Dictionary<string,object?>{{"ref",id}};
        }
        var d=new Dictionary<string,object?>{{"kind",t.Name}}; Fields(v,d); return d;
    }
    void Fields(object v,Dictionary<string,object?> d) {
        foreach(var f in v.GetType().GetFields(BindingFlags.Public|BindingFlags.Instance)) {
            if(f.Name is "ParentContainer" or "XID" || f.Name.StartsWith("DEBUG"))continue;d[f.Name]=Encode(f.GetValue(v));
        }
        foreach(var p in v.GetType().GetProperties(BindingFlags.Public|BindingFlags.Instance)) {
            if(p.Name=="XID"||p.GetIndexParameters().Length>0||!p.CanRead)continue;d[p.Name]=Encode(p.GetValue(v));
        }
    }
    // Offset IDs and writer layout may change. Compare scalar data and topology by traversal IDs.
    public static string Signature(FXR1 f) {
        var g=new Graph();var root=g.Encode(f.RootFXNode);
        var mapping=g.Objects.Keys.Select((k,i)=>(k,id:"o"+i)).ToDictionary(x=>x.k,x=>x.id);
        object? Normalize(object? v) {
            if(v is Dictionary<string,object?> d) return d.ToDictionary(k=>mapping.GetValueOrDefault(k.Key,k.Key),k=>k.Key=="ref"&&k.Value is string s?mapping.GetValueOrDefault(s,s):Normalize(k.Value));
            if(v is IEnumerable e && v is not string) return e.Cast<object?>().Select(Normalize).ToArray();return v;
        }
        return JsonSerializer.Serialize(new{root=Normalize(root),objects=Normalize(g.Objects.ToDictionary(x=>x.Key,x=>x.Value))},Options);
    }
}
record AssetImport(string Archive,int Id,string Name,string Data);
record SoundInsert(string Target,int SoundId);
record ConstantEdit(string Target,string Field,float Value);
record ParameterEdit(string Target,string[] Path,double Value); record CurveEdit(string Target,string Field,List<CurveTick> Ticks);record CurveTick(float Time,float Value);record ExportRequest(string Archive,int Id,string Sha256,List<ParameterEdit> Edits,List<CurveEdit>? Curves=null,List<SoundInsert>? Sounds=null,List<ConstantEdit>? Constants=null);
