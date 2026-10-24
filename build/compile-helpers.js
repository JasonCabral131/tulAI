// Compiles the native voice helper into build/bin/ (macOS + Xcode command line tools). Runs automatically before `npm run build`.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(__dirname, 'bin'); fs.mkdirSync(out, { recursive: true });
const src = path.join(root, 'native', 'tulay-listen.swift'), bin = path.join(out, 'tulay-listen');
const voiceUpToDate = fs.existsSync(bin) && fs.statSync(bin).mtimeMs > fs.statSync(src).mtimeMs;
if (voiceUpToDate) console.log('voice helper is up to date'); else {
execFileSync('swiftc', ['-O', src, '-o', bin, '-framework', 'Speech', '-framework', 'AVFoundation', '-framework', 'ScreenCaptureKit', '-framework', 'CoreMedia', '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', path.join(root, 'native', 'Info.plist')], { stdio: 'inherit' });
console.log('compiled build/bin/tulay-listen'); }

// the picture-reading helper (OCR) uses Apple's Vision framework
{ const osrc = path.join(root, 'native', 'tulay-ocr.swift'), obin = path.join(out, 'tulay-ocr');
  if (fs.existsSync(obin) && fs.statSync(obin).mtimeMs > fs.statSync(osrc).mtimeMs) console.log('ocr helper is up to date');
  else { execFileSync('swiftc', ['-O', osrc, '-o', obin, '-framework', 'Vision', '-framework', 'AppKit'], { stdio: 'inherit' }); console.log('compiled build/bin/tulay-ocr'); } }
{ const src=path.join(root,'native','tulai-pdf-text.swift'),bin=path.join(out,'tulai-pdf-text');
 if(!fs.existsSync(bin)||fs.statSync(bin).mtimeMs<fs.statSync(src).mtimeMs)execFileSync('swiftc',['-O',src,'-o',bin,'-framework','PDFKit'],{stdio:'inherit'}); }
