using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program {
    [STAThread] static void Main(string[] args){ApplicationConfiguration.Initialize();Application.Run(new StudioWindow(args));}
}
sealed class StudioWindow:Form {
    readonly WebView2 view=new(){Dock=DockStyle.Fill};
    readonly Label loading=new(){Text="Starting DS1 Effect Studio…",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,ForeColor=Color.FromArgb(222,194,139),Font=new Font("Segoe UI",14)};
    readonly HttpClient client=new(){Timeout=TimeSpan.FromSeconds(2)};
    readonly string[] args;Process? backend;int port;string url="";
    string Home=>Directory.GetParent(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar))!.FullName;
    void Trace(string stage){int i=Array.IndexOf(args,"--diagnostics");if(i>=0&&i+1<args.Length)File.AppendAllText(args[i+1]+".log",DateTime.UtcNow.ToString("O")+" "+stage+Environment.NewLine);}
    public StudioWindow(string[] input){args=input;Text="DS1 Effect Studio";Width=1440;Height=960;MinimumSize=new Size(1050,720);StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(16,21,28);Controls.Add(view);Controls.Add(loading);Shown+=async(_,_)=>await Start();FormClosed+=(_,_)=>{view.Dispose();if(backend is {HasExited:false})backend.Kill(true);client.Dispose();};}
    async Task Start(){try{
        Trace("Window shown");
        string game=@"E:\Games\Dark Souls Prepare to Die Edition\DATA";int gameIndex=Array.IndexOf(args,"--game");if(gameIndex>=0&&gameIndex+1<args.Length)game=args[gameIndex+1];
        // Reuse the existing local studio so its session imports remain available.
        try{using var health=JsonDocument.Parse(await client.GetStringAsync("http://127.0.0.1:5187/api/health"));if(health.RootElement.GetProperty("ready").GetBoolean())port=5187;}catch{}
        if(port==0){if(!Directory.Exists(Path.Combine(game,"sfx"))){using var picker=new FolderBrowserDialog{Description="Choose Dark Souls PTDE's DATA folder",UseDescriptionForTitle=true};if(picker.ShowDialog()!=DialogResult.OK){Close();return;}game=picker.SelectedPath;if(!Directory.Exists(Path.Combine(game,"sfx")))throw new Exception("That folder has no sfx directory. Select the game's DATA folder.");}
            var listener=new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback,0);listener.Start();port=((System.Net.IPEndPoint)listener.LocalEndpoint).Port;listener.Stop();var info=new ProcessStartInfo(Path.Combine(Home,"app","DS1EffectStudio.exe")){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.Combine(Home,"app")};foreach(var a in new[]{"--game",game,"--port",port.ToString()})info.ArgumentList.Add(a);backend=Process.Start(info)??throw new Exception("Could not start the local effect library.");
            for(int i=0;i<80;i++){if(backend.HasExited)throw new Exception("The local library could not start. Check the DATA folder.");try{await client.GetStringAsync($"http://127.0.0.1:{port}/api/health");break;}catch{await Task.Delay(250);}}
        }
        url=$"http://127.0.0.1:{port}/";
        Trace("Library ready "+url);
        string profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"DS1EffectStudio","WebView2");Trace("Creating WebView2");var env=await CoreWebView2Environment.CreateAsync(null,profile);await view.EnsureCoreWebView2Async(env);Trace("WebView2 initialized");
        view.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;view.CoreWebView2.Settings.IsStatusBarEnabled=false;
        view.CoreWebView2.NavigationStarting+=(_,e)=>{if(!e.Uri.StartsWith(url,StringComparison.OrdinalIgnoreCase)&&e.Uri!="about:blank"){e.Cancel=true;}};
        view.CoreWebView2.NewWindowRequested+=(_,e)=>e.Handled=true;
        view.CoreWebView2.WebMessageReceived+=(_,e)=>{try{using var message=JsonDocument.Parse(e.WebMessageAsJson);if(message.RootElement.GetProperty("type").GetString()!="studio-ready")return;Text="DS1 Effect Studio — "+message.RootElement.GetProperty("effect").GetString();int index=Array.IndexOf(args,"--diagnostics");if(index>=0&&index+1<args.Length)File.WriteAllText(args[index+1],JsonSerializer.Serialize(new{ready=true,runtime=view.CoreWebView2.Environment.BrowserVersionString,url,message=message.RootElement.Clone()}));}catch{}};
        view.CoreWebView2.NavigationCompleted+=(_,e)=>{Trace("Navigation "+e.IsSuccess+" "+e.WebErrorStatus);loading.Visible=false;if(!e.IsSuccess)MessageBox.Show("Could not open the local editor: "+e.WebErrorStatus,"DS1 Effect Studio");};
        view.CoreWebView2.Navigate(url);
    }catch(WebView2RuntimeNotFoundException){Trace("WebView2 absent");MessageBox.Show("Install Microsoft's Evergreen WebView2 Runtime, then reopen this app.\nhttps://developer.microsoft.com/microsoft-edge/webview2/","WebView2 required");Close();}catch(Exception e){Trace(e.ToString());MessageBox.Show(e.Message,"DS1 Effect Studio");Close();}}
}
