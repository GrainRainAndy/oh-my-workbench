import AppKit
import Vision

// Produce a deterministic, non-personal image for this contract test.
if CommandLine.arguments.contains("--sample") {
    let image = NSImage(size: NSSize(width: 1000, height: 200))
    image.lockFocus()
    NSColor.white.setFill()
    NSBezierPath(rect: NSRect(origin: .zero, size: image.size)).fill()
    ("WORKBENCH 2048" as NSString).draw(at: NSPoint(x: 40, y: 60), withAttributes: [
        .font: NSFont.systemFont(ofSize: 76),
        .foregroundColor: NSColor.black
    ])
    image.unlockFocus()
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    FileHandle.standardOutput.write(bitmap.representation(using: .png, properties: [:])!)
} else {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    let input = FileHandle.standardInput.readDataToEndOfFile()
    try VNImageRequestHandler(data: input).perform([request])
    struct Line: Encodable {
        let text: String
        let box: [Double]
    }
    let lines = (request.results ?? []).compactMap { observation -> Line? in
        guard let result = observation.topCandidates(1).first else { return nil }
        let r = observation.boundingBox
        return Line(text: result.string, box: [r.minX, r.minY, r.width, r.height])
    }
    FileHandle.standardOutput.write(try JSONEncoder().encode(lines))
}
