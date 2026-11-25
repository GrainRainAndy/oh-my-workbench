import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum RenderError: Error {
    case usage
    case renderFailed(URL)
}

func color(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
    CGColor(
        srgbRed: CGFloat((hex >> 16) & 255) / 255,
        green: CGFloat((hex >> 8) & 255) / 255,
        blue: CGFloat(hex & 255) / 255,
        alpha: alpha
    )
}

func rounded(_ rect: CGRect, radius: CGFloat) -> CGPath {
    CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
}

// The menu bar and app icon share the same asymmetric workspace.
func drawPanes(in bounds: CGRect, on context: CGContext, colors: [CGColor]) {
    let panes = [
        CGRect(x: 0, y: 0, width: 6, height: 12),
        CGRect(x: 8, y: 0, width: 6, height: 5),
        CGRect(x: 8, y: 7, width: 6, height: 5)
    ]
    context.saveGState()
    context.translateBy(x: bounds.minX, y: bounds.minY)
    context.scaleBy(x: bounds.width / 14, y: bounds.height / 12)
    for (pane, fill) in zip(panes, colors) {
        context.setFillColor(fill)
        context.addPath(rounded(pane, radius: 1.15))
        context.fillPath()
    }
    context.restoreGState()
}

func png(_ output: URL, size: Int, units: CGFloat, draw: (CGContext) -> Void) throws {
    guard let context = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { throw RenderError.renderFailed(output) }
    let scale = CGFloat(size) / units
    context.translateBy(x: 0, y: CGFloat(size))
    context.scaleBy(x: scale, y: -scale)
    draw(context)
    guard let image = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { throw RenderError.renderFailed(output) }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw RenderError.renderFailed(output) }
}

func drawAppIcon(_ context: CGContext) {
    let tile = CGRect(x: 92, y: 92, width: 840, height: 840)
    let tilePath = rounded(tile, radius: 198)
    context.saveGState()
    context.addPath(tilePath)
    context.clip()
    let top = color(0xFFFFFF)
    let base = color(0xF6F8FB)
    if let gradient = CGGradient(colorsSpace: nil, colors: [top, base] as CFArray, locations: [0, 1]) {
        context.drawLinearGradient(
            gradient, start: CGPoint(x: 250, y: 92), end: CGPoint(x: 785, y: 880),
            options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
        )
    }
    context.setStrokeColor(color(0x9EAEC2, alpha: 0.48))
    context.setLineWidth(5)
    context.addPath(rounded(tile.insetBy(dx: 3, dy: 3), radius: 195))
    context.strokePath()
    context.restoreGState()

    let recess = CGRect(x: 213, y: 244, width: 598, height: 536)
    context.setFillColor(color(0xE8EDF4))
    context.addPath(rounded(recess, radius: 70))
    context.fillPath()
    drawPanes(in: recess.insetBy(dx: 28, dy: 32), on: context, colors: [
        color(0x315C9A), color(0x7AA2CB), color(0xDEA359)
    ])
}

guard CommandLine.arguments.count == 2 else { throw RenderError.usage }
let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let iconset = directory.appendingPathComponent("Workbench.iconset", isDirectory: true)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let suffix = scale == 1 ? "" : "@2x"
        let filename = "icon_\(size)x\(size)\(suffix).png"
        try png(iconset.appendingPathComponent(filename), size: size * scale, units: 1024, draw: drawAppIcon)
    }
}
try png(directory.appendingPathComponent("WorkbenchBrand.png"), size: 64, units: 1024, draw: drawAppIcon)
for scale in [1, 2] {
    let suffix = scale == 1 ? "" : "@2x"
    let filename = "WorkbenchTemplate\(suffix).png"
    try png(directory.appendingPathComponent(filename), size: 18 * scale, units: 18) { context in
        drawPanes(in: CGRect(x: 2, y: 3, width: 14, height: 12), on: context,
                  colors: Array(repeating: color(0x000000), count: 3))
    }
}
