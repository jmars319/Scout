import AppKit
import Foundation

guard CommandLine.arguments.count > 1 else {
  fputs("Usage: swift build-icon.swift <output-png-path>\n", stderr)
  exit(1)
}

let outputPath = CommandLine.arguments[1]
let canvasSize: CGFloat = 1024
let canvasRect = NSRect(x: 0, y: 0, width: canvasSize, height: canvasSize)

let image = NSImage(size: canvasRect.size)
image.lockFocus()

NSColor.clear.setFill()
canvasRect.fill()

let insetRect = canvasRect.insetBy(dx: 56, dy: 56)
let backgroundPath = NSBezierPath(roundedRect: insetRect, xRadius: 220, yRadius: 220)
let gradient = NSGradient(colors: [
  NSColor(calibratedRed: 0.02, green: 0.08, blue: 0.15, alpha: 1.0),
  NSColor(calibratedRed: 0.05, green: 0.22, blue: 0.33, alpha: 1.0),
  NSColor(calibratedRed: 0.15, green: 0.74, blue: 0.73, alpha: 1.0)
])!
gradient.draw(in: backgroundPath, angle: -32)

NSGraphicsContext.current?.cgContext.saveGState()
backgroundPath.addClip()

let glowRect = NSRect(x: 140, y: 420, width: 760, height: 760)
let glowPath = NSBezierPath(ovalIn: glowRect)
let glowGradient = NSGradient(colors: [
  NSColor(calibratedRed: 0.40, green: 0.96, blue: 0.90, alpha: 0.26),
  NSColor(calibratedRed: 0.40, green: 0.96, blue: 0.90, alpha: 0.0)
])!
glowGradient.draw(in: glowPath, relativeCenterPosition: NSPoint.zero)

let ringColors = [
  NSColor(calibratedWhite: 1.0, alpha: 0.16),
  NSColor(calibratedWhite: 1.0, alpha: 0.10),
  NSColor(calibratedWhite: 1.0, alpha: 0.07)
]
let ringRects = [
  NSRect(x: 228, y: 228, width: 568, height: 568),
  NSRect(x: 286, y: 286, width: 452, height: 452),
  NSRect(x: 344, y: 344, width: 336, height: 336)
]

for (index, ringRect) in ringRects.enumerated() {
  let ringPath = NSBezierPath(ovalIn: ringRect)
  ringColors[index].setStroke()
  ringPath.lineWidth = index == 0 ? 16 : 10
  ringPath.stroke()
}

let crosshair = NSBezierPath()
crosshair.move(to: NSPoint(x: 512, y: 228))
crosshair.line(to: NSPoint(x: 512, y: 796))
crosshair.move(to: NSPoint(x: 228, y: 512))
crosshair.line(to: NSPoint(x: 796, y: 512))
NSColor(calibratedWhite: 1.0, alpha: 0.07).setStroke()
crosshair.lineWidth = 8
crosshair.lineCapStyle = .round
crosshair.stroke()

let sweepPath = NSBezierPath()
sweepPath.move(to: NSPoint(x: 512, y: 512))
sweepPath.appendArc(
  withCenter: NSPoint(x: 512, y: 512),
  radius: 284,
  startAngle: 18,
  endAngle: 78,
  clockwise: false
)
sweepPath.close()
let sweepGradient = NSGradient(colors: [
  NSColor(calibratedRed: 1.0, green: 0.78, blue: 0.35, alpha: 0.50),
  NSColor(calibratedRed: 1.0, green: 0.78, blue: 0.35, alpha: 0.0)
])!
sweepGradient.draw(in: sweepPath, angle: 42)

let radarDotRect = NSRect(x: 690, y: 655, width: 56, height: 56)
let radarDotPath = NSBezierPath(ovalIn: radarDotRect)
NSColor(calibratedRed: 1.0, green: 0.80, blue: 0.38, alpha: 1.0).setFill()
radarDotPath.fill()

let attributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 530, weight: .black),
  .foregroundColor: NSColor(calibratedWhite: 0.97, alpha: 0.98)
]
let shadow = NSShadow()
shadow.shadowBlurRadius = 28
shadow.shadowOffset = NSSize(width: 0, height: -10)
shadow.shadowColor = NSColor(calibratedRed: 0.02, green: 0.06, blue: 0.10, alpha: 0.34)

let attributedLetter = NSMutableAttributedString(string: "S", attributes: attributes)
attributedLetter.addAttribute(.shadow, value: shadow, range: NSRange(location: 0, length: attributedLetter.length))

let textSize = attributedLetter.size()
let textPoint = NSPoint(
  x: (canvasSize - textSize.width) / 2.0,
  y: (canvasSize - textSize.height) / 2.0 - 48
)
attributedLetter.draw(at: textPoint)

let accentPath = NSBezierPath()
accentPath.move(to: NSPoint(x: 598, y: 624))
accentPath.line(to: NSPoint(x: 722, y: 758))
accentPath.line(to: NSPoint(x: 664, y: 772))
accentPath.line(to: NSPoint(x: 582, y: 682))
accentPath.close()
NSColor(calibratedRed: 0.36, green: 0.96, blue: 0.87, alpha: 0.95).setFill()
accentPath.fill()

NSGraphicsContext.current?.cgContext.restoreGState()

let borderPath = NSBezierPath(roundedRect: insetRect, xRadius: 220, yRadius: 220)
NSColor(calibratedWhite: 1.0, alpha: 0.10).setStroke()
borderPath.lineWidth = 12
borderPath.stroke()

image.unlockFocus()

guard
  let tiffData = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiffData),
  let pngData = bitmap.representation(using: .png, properties: [:])
else {
  fputs("Failed to render Scout icon PNG.\n", stderr)
  exit(1)
}

try pngData.write(to: URL(fileURLWithPath: outputPath))
