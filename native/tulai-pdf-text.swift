import Foundation
import PDFKit
let args = CommandLine.arguments
guard args.count > 1, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])), !doc.isLocked else { fputs("Cannot read PDF; it may be locked.\n", stderr); exit(1) }
guard doc.pageCount <= 500 else { fputs("PDF exceeds 500 page limit.\n", stderr); exit(1) }
var sections = [[String:String]]()
for i in 0..<doc.pageCount {
 let text = doc.page(at:i)?.string ?? ""
 let chars = Array(text)
 if chars.isEmpty { sections.append(["label":"Page \(i+1)","text":"[No extractable text; scanned pages require OCR.]"]) }
 else { for start in stride(from:0,to:chars.count,by:7000) { sections.append(["label":"Page \(i+1) · part \(start/7000+1)","text":String(chars[start..<min(start+7000,chars.count)])]) } }
}
let data = try JSONSerialization.data(withJSONObject: sections)
FileHandle.standardOutput.write(data)
