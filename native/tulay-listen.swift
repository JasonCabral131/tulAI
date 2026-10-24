// tulay-listen: on-device speech recognition for Tulay. Prints one JSON object per line.
//   tulay-listen [--locale en-US]            push to talk: listens until you stop talking, prints partial/final text
//   tulay-listen --wake [--locale en-US]     always listening for "Hey Tulay <command>" (on-device only, nothing leaves the Mac)
//   tulay-listen --file clip.wav [--wake]    transcribe a file (used for testing)
//   tulay-listen --list-locales | --status | --selftest
import Foundation
import Speech
import AVFoundation
import ScreenCaptureKit
import CoreMedia

setbuf(stdout, nil)
func emit(_ o: [String: Any]) {
    if let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) { print(s); fflush(stdout) }
}
let wakeRegex = try! NSRegularExpression(pattern: "\\b(hey|hay|hi|hello|okay|ok|a|play|hate|ay)[,.!?]?\\s+(tulay|too\\s?lie|to\\s?lie|tooly|tuley|toolay|tu\\s?lay|tula|julie|to\\s?lay|too\\s?late|to\\s?late|tulle?y|tooley|tulley|tullay|tulai|tulaye)\\b[,.!?]?\\s*", options: [.caseInsensitive])
let bareRegex = try! NSRegularExpression(pattern: "^\\s*(tulay|too\\s?lie|tooly|tuley|toolay|tu\\s?lay|too\\s?late|tulai)\\b[,.!?]?\\s*", options: [.caseInsensitive])
var aliasList: [String] = []
var aliasRegex: NSRegularExpression? = nil
if let raw = { () -> String? in if let i = CommandLine.arguments.firstIndex(of: "--aliases"), i + 1 < CommandLine.arguments.count { return CommandLine.arguments[i + 1] }; return nil }() {
    let parts = raw.split(separator: "|").map { NSRegularExpression.escapedPattern(for: String($0).trimmingCharacters(in: .whitespaces)).replacingOccurrences(of: "\\ ", with: "\\s+") }.filter { !$0.isEmpty }
    aliasList = raw.split(separator: "|").map { String($0) }
    if !parts.isEmpty { aliasRegex = try? NSRegularExpression(pattern: "\\b(" + parts.joined(separator: "|") + ")\\b[,.!?]?\\s*", options: [.caseInsensitive]) }
}
/// Returns the command that follows "Hey Tulay", or nil when the wake phrase is not present.
func afterWake(_ text: String) -> String? {
    let ns = text as NSString
    guard let m = wakeRegex.firstMatch(in: text, options: [], range: NSRange(location: 0, length: ns.length)) ?? bareRegex.firstMatch(in: text, options: [], range: NSRange(location: 0, length: ns.length)) ?? aliasRegex?.firstMatch(in: text, options: [], range: NSRange(location: 0, length: ns.length)) else { return nil }
    return ns.substring(from: m.range.location + m.range.length).trimmingCharacters(in: .whitespaces)
}

var args = Array(CommandLine.arguments.dropFirst())
func opt(_ name: String) -> String? { if let i = args.firstIndex(of: name), i + 1 < args.count { return args[i + 1] }; return nil }
let localeId = opt("--locale") ?? Locale.current.identifier
let wakeMode = args.contains("--wake")

if args.contains("--list-locales") {
    emit(["type": "locales", "locales": SFSpeechRecognizer.supportedLocales().map { $0.identifier }.sorted()]); exit(0)
}
if args.contains("--status") {
    let st = SFSpeechRecognizer.authorizationStatus()
    let rec = SFSpeechRecognizer(locale: Locale(identifier: localeId))
    emit(["type": "status", "speech": ["notDetermined", "denied", "restricted", "authorized"][Int(st.rawValue)], "mic": AVCaptureDevice.authorizationStatus(for: .audio).rawValue, "available": rec?.isAvailable ?? false, "onDevice": rec?.supportsOnDeviceRecognition ?? false, "locale": localeId]); exit(0)
}
if args.contains("--selftest") {
    let cases: [(String, String?)] = [("hey tulay open the test shop", "open the test shop"), ("Hey, Tulay what's on my screen", "what's on my screen"), ("hey too lie check my missions", "check my missions"), ("play too late what time is it", "what time is it"), ("hello world", nil), ("okay tulay", ""), ("they tulay", nil)]
    var ok = true
    for (t, want) in cases { let got = afterWake(t); let pass = got == want; ok = ok && pass; emit(["type": "selftest", "text": t, "got": got ?? NSNull(), "pass": pass]) }
    emit(["type": "selftest_done", "pass": ok]); exit(ok ? 0 : 1)
}

// ---- record mode: cuts audio into spoken utterances (16 kHz mono WAV) for whisper ----
//   --record            the microphone
//   --record --system   the sound the Mac plays (a Teams/Zoom/Meet call, a video), so a meeting can be captured even when you wear a headset
if args.contains("--record") {
    let once = args.contains("--once"), system = args.contains("--system"), outDir = opt("--dir") ?? NSTemporaryDirectory()
    let q = DispatchQueue(label: "rec")
    var preroll: [[Int16]] = [], seg: [Int16] = [], speaking = false, lastVoice = Date(), voicedMs = 0.0, floor = system ? 0.002 : 0.01, lastLevel = Date(), started = Date(), n = 0
    let tag = system ? "sys" : "mic"
    func writeWav(_ raw: [Int16]) -> String {
        var peak: Int32 = 1; for v in raw { peak = max(peak, abs(Int32(v))) }; let gain = min(25.0, 26000.0 / Double(peak)); let pcm: [Int16] = gain > 1.2 ? raw.map { Int16(max(-32767, min(32767, Double($0) * gain))) } : raw
        n += 1; let path = (outDir as NSString).appendingPathComponent("tulay-utt-\(tag)-\(getpid())-\(n).wav")
        var d = Data(); func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }; func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        d.append("RIFF".data(using: .ascii)!); u32(UInt32(36 + pcm.count * 2)); d.append("WAVEfmt ".data(using: .ascii)!); u32(16); u16(1); u16(1); u32(16000); u32(32000); u16(2); u16(16); d.append("data".data(using: .ascii)!); u32(UInt32(pcm.count * 2))
        pcm.withUnsafeBufferPointer { d.append(Data(buffer: $0)) }; try? d.write(to: URL(fileURLWithPath: path)); return path
    }
    func finish() {
        let ok = voicedMs >= 300; let pcm = seg; if !ok { emit(["type": "debug", "dropped": voicedMs, "samples": pcm.count]) }; seg = []; speaking = false; voicedMs = 0
        if ok { emit(["type": "utterance", "file": writeWav(pcm), "ms": pcm.count / 16, "source": tag]); if once { exit(0) } }
    }
    // every chunk of 16 kHz audio goes through here, whatever its source
    let ingest: ([Int16], Double) -> Void = { chunk, rms in
        let ms = Double(chunk.count) / 16.0
        q.async {
            if Date().timeIntervalSince(lastLevel) > 0.08 { lastLevel = Date(); emit(["type": "level", "v": min(1.0, rms * 8)]) }
            let thr = max(system ? 0.003 : 0.005, floor * 3.0)
            if rms > thr {
                if !speaking { speaking = true; seg = preroll.flatMap { $0 }; emit(["type": "speech"]) }
                lastVoice = Date(); voicedMs += ms
            } else if !speaking { floor = floor * 0.98 + rms * 0.02 }
            if speaking { seg.append(contentsOf: chunk); if Date().timeIntervalSince(lastVoice) > (system ? 0.8 : 0.75) || seg.count > 16000 * (system ? 12 : 25) { finish() } }
            else { preroll.append(chunk); if preroll.count > 10 { preroll.removeFirst() } }
            if once && !speaking && Date().timeIntervalSince(started) > 12 { emit(["type": "final", "text": "", "reason": "no_speech"]); exit(0) }
        }
    }
    // the Mac stops sending audio when it is silent, so an utterance must also be able to end on a clock
    let tick = DispatchSource.makeTimerSource(queue: q); tick.schedule(deadline: .now() + 0.25, repeating: 0.25)
    tick.setEventHandler { if speaking && Date().timeIntervalSince(lastVoice) > (system ? 0.8 : 0.75) { finish() } }
    tick.resume()
    if system {
        final class SysAudio: NSObject, SCStreamOutput {
            let ingest: ([Int16], Double) -> Void
            init(_ f: @escaping ([Int16], Double) -> Void) { ingest = f }
            func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
                guard type == .audio, sb.isValid, let fd = sb.formatDescription, let asbd = fd.audioStreamBasicDescription else { return }
                let frames = Int(sb.numSamples); if frames == 0 { return }; let ch = max(1, Int(asbd.mChannelsPerFrame)), rate = asbd.mSampleRate
                let nonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
                var mono = [Float](repeating: 0, count: frames)
                do {
                    try sb.withAudioBufferList { abl, _ in
                        let bufs = UnsafeMutableAudioBufferListPointer(abl.unsafeMutablePointer)
                        if nonInterleaved { for b in bufs { guard let p = b.mData?.assumingMemoryBound(to: Float.self) else { continue }; let cnt = min(frames, Int(b.mDataByteSize) / 4); for i in 0..<cnt { mono[i] += p[i] / Float(bufs.count) } } }
                        else if let b = bufs.first, let p = b.mData?.assumingMemoryBound(to: Float.self) { let cnt = min(frames, Int(b.mDataByteSize) / (4 * ch)); for i in 0..<cnt { var sum: Float = 0; for c in 0..<ch { sum += p[i * ch + c] }; mono[i] = sum / Float(ch) } }
                    }
                } catch { return }
                let step = max(1, Int((rate / 16000).rounded())); var out = [Int16](); out.reserveCapacity(frames / step + 1); var sumSq: Float = 0
                var i = 0; while i + step <= frames { var a: Float = 0; for k in 0..<step { a += mono[i + k] }; a /= Float(step); sumSq += a * a; out.append(Int16(max(-32767, min(32767, a * 32767)))); i += step }
                if out.isEmpty { return }; ingest(out, Double((sumSq / Float(out.count)).squareRoot()))
            }
        }
        let sem = DispatchSemaphore(value: 0); var content: SCShareableContent?; var cerr: Error?
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { c, e in content = c; cerr = e; sem.signal() }
        sem.wait()
        guard let display = content?.displays.first else { emit(["type": "error", "code": "screen_denied", "message": "Tulai needs Screen & System Audio Recording permission to hear the meeting audio. Turn it on in System Settings → Privacy & Security → Screen & System Audio Recording. \(cerr?.localizedDescription ?? "")"]); exit(8) }
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let cfg = SCStreamConfiguration(); cfg.capturesAudio = true; cfg.excludesCurrentProcessAudio = true; cfg.sampleRate = 48000; cfg.channelCount = 1
        cfg.width = 2; cfg.height = 2; cfg.minimumFrameInterval = CMTime(value: 1, timescale: 2); cfg.queueDepth = 3
        let sys = SysAudio(ingest); let stream = SCStream(filter: filter, configuration: cfg, delegate: nil)
        do { try stream.addStreamOutput(sys, type: .audio, sampleHandlerQueue: DispatchQueue(label: "sysaudio")) } catch { emit(["type": "error", "code": "engine", "message": "Could not listen to the Mac's sound: \(error.localizedDescription)"]); exit(7) }
        let ssem = DispatchSemaphore(value: 0); var serr: Error?
        stream.startCapture { e in serr = e; ssem.signal() }; ssem.wait()
        if let e = serr { emit(["type": "error", "code": "screen_denied", "message": "Could not start listening to the Mac's sound: \(e.localizedDescription). Check Screen & System Audio Recording permission for Tulai."]); exit(8) }
        emit(["type": "ready", "mode": "system", "engine": "whisper"])
        DispatchQueue.global().async { while let line = readLine() { if line.trimmingCharacters(in: .whitespaces) == "stop" { exit(0) } }; exit(0) }
        withExtendedLifetime(sys) { RunLoop.main.run() }
    }
    let sem = DispatchSemaphore(value: 0); var micOK = false
    AVCaptureDevice.requestAccess(for: .audio) { g in micOK = g; sem.signal() }
    sem.wait()
    if !micOK { emit(["type": "error", "code": "mic_denied", "message": "Microphone access is off. Turn it on in System Settings → Privacy & Security → Microphone."]); exit(6) }
    let engine = AVAudioEngine(), input = engine.inputNode, inFmt = input.outputFormat(forBus: 0)
    let outFmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
    guard let conv = AVAudioConverter(from: inFmt, to: outFmt) else { emit(["type": "error", "code": "engine", "message": "Could not set up the microphone."]); exit(7) }
    input.installTap(onBus: 0, bufferSize: 2048, format: inFmt) { buf, _ in
        guard let ch = buf.floatChannelData?[0] else { return }
        let nf = Int(buf.frameLength); var sum: Float = 0; for i in 0..<nf { sum += ch[i] * ch[i] }; let rms = Double((sum / Float(max(nf, 1))).squareRoot())
        let cap = AVAudioFrameCount(Double(buf.frameLength) * 16000 / inFmt.sampleRate) + 64
        guard let ob = AVAudioPCMBuffer(pcmFormat: outFmt, frameCapacity: cap) else { return }
        var given = false; var err: NSError?
        conv.convert(to: ob, error: &err) { _, st in if given { st.pointee = .noDataNow; return nil }; given = true; st.pointee = .haveData; return buf }
        guard err == nil, let p = ob.int16ChannelData?[0] else { return }
        ingest(Array(UnsafeBufferPointer(start: p, count: Int(ob.frameLength))), rms)
    }
    engine.prepare()
    do { try engine.start() } catch { emit(["type": "error", "code": "engine", "message": "Could not start the microphone: \(error.localizedDescription)"]); exit(7) }
    emit(["type": "ready", "mode": once ? "once" : "wake", "engine": "whisper"])
    DispatchQueue.global().async { while let line = readLine() { if line.trimmingCharacters(in: .whitespaces) == "stop" { exit(0) } }; exit(0) }
    RunLoop.main.run()
}

// ---- permissions ----
if CommandLine.arguments.contains("--file") == false || true {
    let sem = DispatchSemaphore(value: 0); var ok = false
    SFSpeechRecognizer.requestAuthorization { st in ok = (st == .authorized); sem.signal() }
    sem.wait()
    if !ok { emit(["type": "error", "code": "speech_denied", "message": "Speech recognition is not allowed. Turn it on in System Settings → Privacy & Security → Speech Recognition."]); exit(2) }
}
guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)), recognizer.isAvailable else {
    emit(["type": "error", "code": "unavailable", "message": "Speech recognition is not available for \(localeId). Check System Settings → Keyboard → Dictation."]); exit(3)
}
if wakeMode && !recognizer.supportsOnDeviceRecognition {
    emit(["type": "error", "code": "no_ondevice", "message": "Always-listening needs on-device recognition. Add this language under System Settings → Keyboard → Dictation, or use push to talk."]); exit(4)
}

// ---- file transcription (testing) ----
if let path = opt("--file") {
    let req = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: path)); req.shouldReportPartialResults = false
    if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
    recognizer.recognitionTask(with: req) { r, e in
        if let r = r, r.isFinal { let t = r.bestTranscription.formattedString; emit(["type": "final", "text": t, "command": afterWake(t) ?? NSNull(), "wake": afterWake(t) != nil]); exit(0) }
        if let e = e { emit(["type": "error", "code": "failed", "message": e.localizedDescription]); exit(5) }
    }
    RunLoop.main.run()
}

// ---- microphone ----
let micSem = DispatchSemaphore(value: 0); var micOK = false
AVCaptureDevice.requestAccess(for: .audio) { g in micOK = g; micSem.signal() }
micSem.wait()
if !micOK { emit(["type": "error", "code": "mic_denied", "message": "Microphone access is off. Turn it on in System Settings → Privacy & Security → Microphone."]); exit(6) }

let engine = AVAudioEngine()
var request: SFSpeechAudioBufferRecognitionRequest?
var task: SFSpeechRecognitionTask?
var lastText = "", lastChange = Date(), startedAt = Date(), armed = false, armedAt = Date(), sessionAt = Date(), lastLevel = Date()

func newSession() {
    task?.cancel(); request?.endAudio()
    let r = SFSpeechAudioBufferRecognitionRequest(); r.shouldReportPartialResults = true; r.contextualStrings = ["Hey Tulay", "Tulay", "Okay Tulay", "Hi Tulay"] + (aliasList); r.taskHint = .dictation
    if recognizer.supportsOnDeviceRecognition { r.requiresOnDeviceRecognition = true }
    request = r; lastText = ""; lastChange = Date(); startedAt = Date(); sessionAt = Date(); armed = false
    task = recognizer.recognitionTask(with: r) { res, err in
        if let res = res {
            let t = res.bestTranscription.formattedString
            if t != lastText {
                lastText = t; lastChange = Date()
                if wakeMode { emit(["type": "heard", "text": t]) }
                if wakeMode {
                    if let cmd = afterWake(t) { if !armed { armed = true; armedAt = Date(); emit(["type": "wake"]) }; emit(["type": "partial", "text": cmd]) }
                } else { emit(["type": "partial", "text": t]) }
            }
            if res.isFinal { finishSession() }
        }
        if let err = err { emit(["type": "recerr", "message": err.localizedDescription, "code": (err as NSError).code]); finishSession() }
    }
}
func finishSession() {
    if wakeMode {
        if armed { emit(["type": "final", "text": afterWake(lastText) ?? ""]) }
        newSession()
    } else {
        engine.stop(); engine.inputNode.removeTap(onBus: 0); emit(["type": "final", "text": lastText]); exit(0)
    }
}

let input = engine.inputNode
input.installTap(onBus: 0, bufferSize: 2048, format: input.outputFormat(forBus: 0)) { buf, _ in
    request?.append(buf)
    if Date().timeIntervalSince(lastLevel) > 0.08, let ch = buf.floatChannelData?[0] {
        lastLevel = Date(); var sum: Float = 0; let n = Int(buf.frameLength); for i in 0..<n { sum += ch[i] * ch[i] }
        emit(["type": "level", "v": min(1.0, Double((sum / Float(max(n, 1))).squareRoot()) * 8)])
    }
}
engine.prepare()
do { try engine.start() } catch { emit(["type": "error", "code": "engine", "message": "Could not start the microphone: \(error.localizedDescription)"]); exit(7) }
newSession()
emit(["type": "ready", "mode": wakeMode ? "wake" : "once", "onDevice": recognizer.supportsOnDeviceRecognition, "locale": localeId])

// stop request from the app
DispatchQueue.global().async { while let line = readLine() { if line.trimmingCharacters(in: .whitespaces) == "stop" { DispatchQueue.main.async { if wakeMode { exit(0) } else { request?.endAudio(); DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { finishSession() } } } } } ; exit(0) }

// silence handling
Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in
    let quiet = Date().timeIntervalSince(lastChange)
    if wakeMode {
        if armed, quiet > (afterWake(lastText)?.isEmpty == false ? 1.5 : 4.0) || (armed && Date().timeIntervalSince(armedAt) > 15) { request?.endAudio() }
        else if !armed && (Date().timeIntervalSince(sessionAt) > 40 || (!lastText.isEmpty && quiet > 2.0)) { newSession() }   // recognizers stop after about a minute; roll the session
    } else {
        if !lastText.isEmpty && quiet > 1.6 { request?.endAudio() }
        else if lastText.isEmpty && Date().timeIntervalSince(startedAt) > 9 { emit(["type": "final", "text": "", "reason": "no_speech"]); exit(0) }
    }
}
RunLoop.main.run()
