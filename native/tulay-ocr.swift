// Reads the text in a picture, on this Mac, with Apple's Vision framework (no network, no model download).
// usage: tulay-ocr <image path>   ->  prints the text, one line per line of text found
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else { FileHandle.standardError.write("usage: tulay-ocr <image>\n".data(using: .utf8)!); exit(2) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { FileHandle.standardError.write("cannot open image\n".data(using: .utf8)!); exit(3) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do { try handler.perform([req]) } catch { FileHandle.standardError.write("ocr failed: \(error.localizedDescription)\n".data(using: .utf8)!); exit(4) }
let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
