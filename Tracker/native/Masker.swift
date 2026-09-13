import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

// Local Apple Vision inference. White means exclude; never sends image data anywhere.
let args = CommandLine.arguments
guard args.count == 3 else { fputs("Usage: masker image-directory mask-directory\n", stderr); exit(2) }
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let files = try FileManager.default.contentsOfDirectory(at: input, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension == "jpg" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
let context = CIContext(options: [.cacheIntermediates: false])
var failures = 0
for (index, url) in files.enumerated() {
    autoreleasepool {
        do {
            guard let image = CIImage(contentsOf: url) else { throw NSError(domain: "Masker", code: 1) }
            let request = VNGeneratePersonSegmentationRequest()
            request.qualityLevel = .accurate
            request.outputPixelFormat = kCVPixelFormatType_OneComponent8
            let text = VNRecognizeTextRequest()
            text.recognitionLevel = .fast
            text.usesLanguageCorrection = false
            let people = VNDetectHumanRectanglesRequest()
            people.upperBodyOnly = false
            try VNImageRequestHandler(url: url).perform([request, text, people])
            let width = image.extent.width, height = image.extent.height
            var mask = CIImage(color: .black).cropped(to: image.extent)
            if let observation = request.results?.first {
                let raw = CIImage(cvPixelBuffer: observation.pixelBuffer)
                mask = raw.transformed(by: CGAffineTransform(scaleX: width/raw.extent.width, y: height/raw.extent.height))
            }
            var boxes: [[Double]] = []
            for observation in people.results ?? [] {
                let box = observation.boundingBox
                let rect = CGRect(x: box.minX*width-8, y: box.minY*height-8, width: box.width*width+16, height: box.height*height+16)
                mask = CIImage(color: .white).cropped(to: rect).composited(over: mask)
            }
            for observation in text.results ?? [] {
                let box = observation.boundingBox
                boxes.append([box.minX, 1-box.maxY, box.maxX, 1-box.minY])
                let rect = CGRect(x: box.minX*width-5, y: box.minY*height-5, width: box.width*width+10, height: box.height*height+10)
                mask = CIImage(color: .white).cropped(to: rect).composited(over: mask)
            }
            guard let cg = context.createCGImage(mask, from: image.extent),
                  let dest = CGImageDestinationCreateWithURL(output.appendingPathComponent(url.lastPathComponent + ".png") as CFURL, UTType.png.identifier as CFString, 1, nil)
            else { throw NSError(domain: "Masker", code: 2) }
            CGImageDestinationAddImage(dest, cg, nil)
            guard CGImageDestinationFinalize(dest) else { throw NSError(domain: "Masker", code: 3) }
            let info: [String: Any] = ["file":url.lastPathComponent, "textBoxes":boxes, "peopleDetected":people.results?.count ?? 0]
            try JSONSerialization.data(withJSONObject: info).write(to: output.appendingPathComponent(url.lastPathComponent + ".json"))
            print("MASK \(index+1)/\(files.count)")
            fflush(stdout)
        } catch {
            failures += 1
            fputs("MASK_ERROR \(url.lastPathComponent): \(error)\n", stderr)
        }
    }
}
exit(failures == 0 ? 0 : 1)
