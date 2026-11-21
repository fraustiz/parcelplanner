// Reads Parcel Simulator's packages straight from its IoStore archives, without FModel.
// See docs/game-data/extraction.md for the whole procedure.
//
//   dotnet run -- list <regex>                       package paths matching <regex>
//   dotnet run -- grep <regex> <text>...             which matching packages contain <text>
//   dotnet run -- dump <regex> <outDir> <usmap>      every export of the matching .uasset or .umap as JSON,
//                                                    laid out like FModel's Output\Exports
//   dotnet run -- png <regex> <outDir> <usmap> [width]
//                                                    every matching Texture2D as <outDir>\<name>.png,
//                                                    scaled down to [width] pixels wide if given
//
// Environment: PARCEL_PAKS (the game's Content\Paks folder) and UE_VERSION (an EGame name,
// GAME_UE5_7 by default). `list` and `grep` need no mappings; `dump` and `png` do.
using System.Text.RegularExpressions;
using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion.Textures;
using Newtonsoft.Json;
using SkiaSharp;

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: list <regex> | grep <regex> <text>... | dump <regex> <outDir> <usmap> | png <regex> <outDir> <usmap> [width]");
    return 2;
}

var paks = Environment.GetEnvironmentVariable("PARCEL_PAKS")
    ?? @"C:\Program Files (x86)\Steam\steamapps\common\Parcel Simulator\parcel\Content\Paks";
var version = Enum.Parse<EGame>(Environment.GetEnvironmentVariable("UE_VERSION") ?? "GAME_UE5_7");

// The archives are Oodle-compressed; CUE4Parse fetches the decoder once.
string? oodle = Path.Combine(AppContext.BaseDirectory, "oo2core_9_win64.dll");
if (!File.Exists(oodle)) OodleHelper.DownloadOodleDll(ref oodle);
OodleHelper.Initialize(oodle);

var provider = new DefaultFileProvider(paks, SearchOption.TopDirectoryOnly, new VersionContainer(version));
// Blueprint bytecode: where the hardcoded numbers live (see kismet.py).
provider.ReadScriptData = true;
provider.Initialize();
provider.Mount();

var pattern = new Regex(args[1], RegexOptions.IgnoreCase);
var files = provider.Files.Keys.Where(k => pattern.IsMatch(k)).OrderBy(k => k).ToList();

switch (args[0])
{
    case "list":
        foreach (var f in files) Console.WriteLine(f);
        return 0;

    case "grep":
        foreach (var f in files)
        {
            var text = System.Text.Encoding.Latin1.GetString(provider.Files[f].Read());
            foreach (var needle in args.Skip(2))
                if (text.Contains(needle, StringComparison.OrdinalIgnoreCase)) Console.WriteLine($"{needle}\t{f}");
        }
        return 0;

    case "dump":
        if (args.Length < 4)
        {
            Console.Error.WriteLine("dump needs <outDir> and <usmap>: the packages use unversioned properties.");
            return 2;
        }
        provider.MappingsContainer = new FileUsmapTypeMappingsProvider(args[3]);
        var failed = 0;
        foreach (var f in files.Where(IsPackage))
        {
            try
            {
                // One export that fails to read must not lose the rest of its package.
                var exports = new List<object>();
                foreach (var lazy in provider.LoadPackage(f).ExportsLazy)
                {
                    try { exports.Add(lazy.Value); }
                    catch (Exception ex) { exports.Add(new { error = ex.Message }); }
                }
                var outPath = Path.Combine(args[2], Path.ChangeExtension(f, null) + ".json");
                Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
                File.WriteAllText(outPath, JsonConvert.SerializeObject(exports, Formatting.Indented));
            }
            catch (Exception e)
            {
                failed++;
                Console.Error.WriteLine($"FAIL {f}: {e.Message}");
            }
        }
        Console.WriteLine($"{files.Count(IsPackage) - failed} packages written, {failed} failed");
        return failed == 0 ? 0 : 1;

    case "png":
        if (args.Length < 4)
        {
            Console.Error.WriteLine("png needs <outDir> and <usmap>: the packages use unversioned properties.");
            return 2;
        }
        provider.MappingsContainer = new FileUsmapTypeMappingsProvider(args[3]);
        var width = args.Length > 4 ? int.Parse(args[4]) : 0;
        Directory.CreateDirectory(args[2]);
        var written = 0;
        foreach (var f in files.Where(f => f.EndsWith(".uasset")))
        {
            foreach (var texture in provider.LoadPackage(f).GetExports().OfType<UTexture2D>())
            {
                using var bitmap = texture.Decode()?.ToSkBitmap();
                if (bitmap is null)
                {
                    Console.Error.WriteLine($"FAIL {f}: could not decode {texture.Name}");
                    continue;
                }
                // Scale down only: a small UI icon, never a blown-up one.
                var w = width > 0 && width < bitmap.Width ? width : bitmap.Width;
                var h = (int)Math.Round(bitmap.Height * (double)w / bitmap.Width);
                using var scaled = w == bitmap.Width ? bitmap.Copy() : bitmap.Resize(new SKImageInfo(w, h), SKFilterQuality.High);
                using var image = SKImage.FromBitmap(scaled);
                using var png = image.Encode(SKEncodedImageFormat.Png, 100);
                var outPath = Path.Combine(args[2], texture.Name + ".png");
                using (var stream = File.Create(outPath)) png.SaveTo(stream);
                Console.WriteLine($"{outPath}	{bitmap.Width}x{bitmap.Height} -> {w}x{h}");
                written++;
            }
        }
        Console.WriteLine($"{written} textures written");
        return written > 0 ? 0 : 1;

    default:
        Console.Error.WriteLine($"unknown command {args[0]}");
        return 2;
}

// A package dump can read: an asset, or a level (actors placed in the world).
static bool IsPackage(string f) => f.EndsWith(".uasset") || f.EndsWith(".umap");
