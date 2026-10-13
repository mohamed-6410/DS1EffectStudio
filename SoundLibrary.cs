using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;

// FSB4 layout and FEV v61 layout checked against the installed PTDE banks.
// Layout reference: vgmstream/src/meta/fsb.c and fsb_fev.h (see AUDIO.md).
sealed class SoundLibrary {
    readonly string folder;
    readonly Dictionary<string,List<SoundSample>> banks=new(StringComparer.OrdinalIgnoreCase);
    readonly List<SoundEvent> events=new();
    readonly List<string> warnings=new();
    readonly SemaphoreSlim decoder=new(1);
    public SoundLibrary(string path){folder=path;if(!Directory.Exists(path))return;
        foreach(var p in Directory.GetFiles(path,"*.fsb")){try{using var r=new BinaryReader(File.OpenRead(p));if(Encoding.ASCII.GetString(r.ReadBytes(4))!="FSB4")throw new InvalidDataException("Only FSB4 banks supported");int count=r.ReadInt32();if(count<0||count>100000)throw new InvalidDataException("Invalid sample count");r.BaseStream.Position=48;var list=new List<SoundSample>();for(int i=0;i<count;i++){long start=r.BaseStream.Position;int size=r.ReadUInt16();if(size<80||start+size>r.BaseStream.Length)throw new InvalidDataException("Invalid sample header");string name=Encoding.ASCII.GetString(r.ReadBytes(30)).TrimEnd('\0');int samples=r.ReadInt32();r.BaseStream.Position=start+52;int rate=r.ReadInt32();r.BaseStream.Position=start+62;int channels=r.ReadUInt16();list.Add(new(i+1,name,rate>0?(double)samples/rate:0,channels));r.BaseStream.Position=start+size;}banks[Path.GetFileName(p)]=list;}catch(Exception e){warnings.Add(Path.GetFileName(p)+": "+e.Message);}}
        foreach(var p in Directory.GetFiles(path,"*.fev")){try{events.AddRange(Fev61.Read(p));}catch(Exception e){warnings.Add(Path.GetFileName(p)+": "+e.Message);}}
    }
    public object Catalog()=>new{banks=banks.Select(b=>new{name=b.Key,samples=b.Value}),events,warnings,decoderAvailable=File.Exists(Decoder)};
    string Decoder=>Path.Combine(AppContext.BaseDirectory,"audio","vgmstream-cli.exe");
    public async Task<byte[]> Decode(string bank,int sample){if(!banks.TryGetValue(bank,out var list)||sample<1||sample>list.Count)throw new InvalidDataException("Unknown bank or sample");if(!File.Exists(Decoder))throw new InvalidDataException("Audio decoder absent; rebuild with the audio folder");await decoder.WaitAsync();string output=Path.Combine(Path.GetTempPath(),"DS1EffectStudio-"+Guid.NewGuid()+".wav");try{var info=new ProcessStartInfo(Decoder){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true,RedirectStandardOutput=true};foreach(var a in new[]{"-s",sample.ToString(),"-i","-o",output,Path.Combine(folder,bank)})info.ArgumentList.Add(a);using var p=Process.Start(info)??throw new InvalidDataException("Could not start decoder");var stdout=p.StandardOutput.ReadToEndAsync();var stderr=p.StandardError.ReadToEndAsync();using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(40));try{await p.WaitForExitAsync(timeout.Token);}catch{p.Kill(true);throw new InvalidDataException("Audio decoding timed out");}await stdout;var error=await stderr;if(p.ExitCode!=0||!File.Exists(output))throw new InvalidDataException("Audio decoding failed: "+error);if(new FileInfo(output).Length>128*1024*1024)throw new InvalidDataException("Sample too long for preview");return await File.ReadAllBytesAsync(output);}finally{if(File.Exists(output))File.Delete(output);decoder.Release();}}
}
record SoundSample(int Index,string Name,double Duration,int Channels);
record SoundWave(string Bank,int Sample,string Name);
record SoundEvent(string Bank,string Name,int? SoundId,List<SoundWave> Waves);

sealed class Fev61 {
    readonly BinaryReader r;readonly string bank;
    readonly List<(string Name,List<int> Definitions)> calls=new();
    readonly List<List<SoundWave>> definitions=new();
    Fev61(string path){r=new(File.OpenRead(path));bank=Path.GetFileNameWithoutExtension(path);}
    int Count(){int v=r.ReadInt32();if(v<0||v>100000)throw new InvalidDataException("Invalid FEV count at "+(r.BaseStream.Position-4));return v;}
    void Skip(int n){if(n<0||r.BaseStream.Position+n>r.BaseStream.Length)throw new InvalidDataException("Truncated FEV");r.BaseStream.Position+=n;}
    string Str(){int size=Count();if(size==0)return "";if(size>4096)throw new InvalidDataException("Invalid FEV string");byte[] b=r.ReadBytes(size);if(b.Length!=size||b[^1]!=0)throw new InvalidDataException("Invalid FEV terminator");return Encoding.UTF8.GetString(b,0,size-1);}
    void Properties(){int count=Count();for(int i=0;i<count;i++){Str();int type=r.ReadInt32();if(type==2)Str();else if(type is 0 or 1)Skip(4);else throw new InvalidDataException("Unknown property type");}}
    void Category(){Str();Skip(16);int n=Count();for(int i=0;i<n;i++)Category();}
    void Group(){Str();Properties();int groups=Count(),events=Count();for(int i=0;i<groups;i++)Group();for(int i=0;i<events;i++)Event();}
    void Sound(List<int> defs){defs.Add(r.ReadUInt16());Skip(56);}
    void Envelope(){Skip(4);Str();Skip(12);int points=Count();Skip(checked(points*12));Skip(8);}
    void Event(){int type=r.ReadInt32();string name=Str();Skip(16);Skip(132);var defs=new List<int>();if((type&24)==8){int layers=Count();for(int i=0;i<layers;i++){Skip(6);int sounds=r.ReadUInt16(),envelopes=r.ReadUInt16();for(int j=0;j<sounds;j++)Sound(defs);for(int j=0;j<envelopes;j++)Envelope();}int pars=Count();for(int i=0;i<pars;i++){Str();Skip(24);int sustain=Count();Skip(checked(sustain*4));}Properties();}else if((type&24)==16){Skip(4);Sound(defs);}else throw new InvalidDataException("Unknown event type");int categories=Count();for(int i=0;i<categories;i++)Str();calls.Add((name,defs));}
    public static List<SoundEvent> Read(string path){var f=new Fev61(path);using(f.r){if(Encoding.ASCII.GetString(f.r.ReadBytes(4))!="FEV1"||f.r.ReadInt32()!=0x003D0000)throw new InvalidDataException("Event mapping supports FEV1 version 61; samples still available");f.Skip(8);f.Str();int banks=f.Count();for(int i=0;i<banks;i++){f.Skip(16);f.Str();}f.Category();int groups=f.Count();for(int i=0;i<groups;i++)f.Group();int settings=f.Count();f.Skip(checked(settings*64));int defs=f.Count();for(int i=0;i<defs;i++){f.Str();f.Skip(4);int n=f.Count();var waves=new List<SoundWave>();for(int j=0;j<n;j++){int type=f.r.ReadInt32();f.Skip(4);if(type==0){string name=f.Str(),bank=f.Str();int sample=f.r.ReadInt32();f.Skip(4);waves.Add(new(Path.GetFileName(bank.Replace('\\','/'))+".fsb",sample+1,name));}else if(type==1)f.Skip(8);else if(type is not 2 and not 3)throw new InvalidDataException("Unknown wave type");}f.definitions.Add(waves);}return f.calls.Select(c=>{var m=Regex.Match(c.Name,@"^[sf](\d{9})$");return new SoundEvent(f.bank,c.Name,m.Success?int.Parse(m.Groups[1].Value):null,c.Definitions.SelectMany(d=>d<f.definitions.Count?f.definitions[d]:new List<SoundWave>()).Distinct().ToList());}).ToList();}}
}
