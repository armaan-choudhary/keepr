//
//  KeeprTests.swift
//  keeprTests
//

import XCTest
import Photos
import ImageIO
@testable import keepr

final class KeeprTests: XCTestCase {

    // MARK: - 1. Authorization Status Mapping Tests

    func testAuthorizationStatusMapping() {
        let adapter = PhotoKitAdapter()
        
        let notDetermined = adapter.mapAuthorizationStatus(.notDetermined)
        XCTAssertEqual(notDetermined["status"] as? String, "notDetermined")
        XCTAssertEqual(notDetermined["scope"] as? String, "none")
        XCTAssertEqual(notDetermined["canSelectMore"] as? Bool, false)
        
        let restricted = adapter.mapAuthorizationStatus(.restricted)
        XCTAssertEqual(restricted["status"] as? String, "restricted")
        XCTAssertEqual(restricted["scope"] as? String, "none")
        XCTAssertEqual(restricted["canSelectMore"] as? Bool, false)
        
        let denied = adapter.mapAuthorizationStatus(.denied)
        XCTAssertEqual(denied["status"] as? String, "denied")
        XCTAssertEqual(denied["scope"] as? String, "none")
        XCTAssertEqual(denied["canSelectMore"] as? Bool, false)
        
        let limited = adapter.mapAuthorizationStatus(.limited)
        XCTAssertEqual(limited["status"] as? String, "limited")
        XCTAssertEqual(limited["scope"] as? String, "selected")
        XCTAssertEqual(limited["canSelectMore"] as? Bool, true)
        
        let authorized = adapter.mapAuthorizationStatus(.authorized)
        XCTAssertEqual(authorized["status"] as? String, "authorized")
        XCTAssertEqual(authorized["scope"] as? String, "full")
        XCTAssertEqual(authorized["canSelectMore"] as? Bool, false)
    }

    // MARK: - 2. Limited Access Handling Tests

    func testLimitedAccessStateAndPickerRestrictions() {
        let adapter = PhotoKitAdapter()
        let limited = adapter.mapAuthorizationStatus(.limited)
        
        XCTAssertTrue(limited["canSelectMore"] as? Bool == true, "Limited access must allow selecting more media")
        XCTAssertEqual(limited["scope"] as? String, "selected")
        
        // Error descriptions for limited access
        let error = PhotoKitError.limitedAccessRestricted("Native album operations are unavailable under iOS Limited Photos access.")
        XCTAssertTrue(error.errorDescription?.contains("Limited Access") == true)
        XCTAssertTrue(error.errorDescription?.contains("Native album operations are unavailable") == true)
    }

    // MARK: - 3. Dimension Clamping Math Tests

    func testDimensionClampingMath() {
        // Landscape image exceeding 2560px
        let landscape = IOSCompressor.calculateDimensions(width: 4000, height: 3000, maxDimension: 2560)
        XCTAssertEqual(landscape.width, 2560)
        XCTAssertEqual(landscape.height, 1920) // 3000 * (2560/4000) = 1920
        
        // Portrait image exceeding 2560px
        let portrait = IOSCompressor.calculateDimensions(width: 3000, height: 6000, maxDimension: 2560)
        XCTAssertEqual(portrait.width, 1280) // 3000 * (2560/6000) = 1280
        XCTAssertEqual(portrait.height, 2560)
        
        // Square image exceeding 2560px
        let square = IOSCompressor.calculateDimensions(width: 5000, height: 5000, maxDimension: 2560)
        XCTAssertEqual(square.width, 2560)
        XCTAssertEqual(square.height, 2560)
        
        // Image smaller than 2560px: must NEVER upscale
        let smaller = IOSCompressor.calculateDimensions(width: 1920, height: 1080, maxDimension: 2560)
        XCTAssertEqual(smaller.width, 1920)
        XCTAssertEqual(smaller.height, 1080)
        
        // Image exactly 2560px
        let exact = IOSCompressor.calculateDimensions(width: 2560, height: 1440, maxDimension: 2560)
        XCTAssertEqual(exact.width, 2560)
        XCTAssertEqual(exact.height, 1440)
        
        // Edge cases
        let zero = IOSCompressor.calculateDimensions(width: 0, height: 0, maxDimension: 2560)
        XCTAssertEqual(zero.width, 0)
        XCTAssertEqual(zero.height, 0)
    }

    // MARK: - 4. EXIF & Metadata Preservation Tests

    func testEXIFPreservationLogic() {
        // Mock source metadata properties
        var mockProperties: [CFString: Any] = [:]
        mockProperties[kCGImagePropertyPixelWidth] = 4032
        mockProperties[kCGImagePropertyPixelHeight] = 3024
        mockProperties[kCGImagePropertyOrientation] = 6 // Right-Top
        
        var exifSubdict: [CFString: Any] = [:]
        exifSubdict[kCGImagePropertyExifExposureTime] = 0.008
        exifSubdict[kCGImagePropertyExifFNumber] = 1.8
        exifSubdict[kCGImagePropertyExifISOSpeedRatings] = [100]
        exifSubdict[kCGImagePropertyExifDateTimeOriginal] = "2026:10:27 10:00:00"
        mockProperties[kCGImagePropertyExifDictionary] = exifSubdict
        
        var gpsSubdict: [CFString: Any] = [:]
        gpsSubdict[kCGImagePropertyGPSLatitude] = 37.7749
        gpsSubdict[kCGImagePropertyGPSLongitude] = -122.4194
        mockProperties[kCGImagePropertyGPSDictionary] = gpsSubdict
        
        // Apply downscaling metadata transformation
        let targetDimensions = IOSCompressor.calculateDimensions(width: 4032, height: 3024, maxDimension: 2560)
        var outputProperties = mockProperties
        outputProperties[kCGImagePropertyPixelWidth] = targetDimensions.width
        outputProperties[kCGImagePropertyPixelHeight] = targetDimensions.height
        outputProperties[kCGImagePropertyOrientation] = 1 // Normalized to standard Top-Left
        outputProperties[kCGImageDestinationLossyCompressionQuality] = 0.8
        
        // Assert dimensions updated
        XCTAssertEqual(outputProperties[kCGImagePropertyPixelWidth] as? Int, 2560)
        XCTAssertEqual(outputProperties[kCGImagePropertyPixelHeight] as? Int, 1920)
        XCTAssertEqual(outputProperties[kCGImagePropertyOrientation] as? Int, 1)
        
        // Assert EXIF and GPS subdictionaries preserved
        let preservedExif = outputProperties[kCGImagePropertyExifDictionary] as? [CFString: Any]
        XCTAssertNotNil(preservedExif)
        XCTAssertEqual(preservedExif?[kCGImagePropertyExifExposureTime] as? Double, 0.008)
        XCTAssertEqual(preservedExif?[kCGImagePropertyExifFNumber] as? Double, 1.8)
        XCTAssertEqual(preservedExif?[kCGImagePropertyExifDateTimeOriginal] as? String, "2026:10:27 10:00:00")
        
        let preservedGPS = outputProperties[kCGImagePropertyGPSDictionary] as? [CFString: Any]
        XCTAssertNotNil(preservedGPS)
        XCTAssertEqual(preservedGPS?[kCGImagePropertyGPSLatitude] as? Double, 37.7749)
        XCTAssertEqual(preservedGPS?[kCGImagePropertyGPSLongitude] as? Double, -122.4194)
    }

    // MARK: - 5. Commit Semantics & Recovery Description Tests

    func testCommitSemanticsAndRecoveryDescription() {
        let commitAdapter = IOSCommitAdapter()
        
        // iOS PhotoKit deletions place assets in "Recently Deleted", NOT MediaStore trash
        XCTAssertFalse(commitAdapter.canTrash(), "iOS does not support MediaStore-style trash; deletions go to PhotoKit Recently Deleted")
        
        let recoveryDesc = commitAdapter.getPlatformRecoveryDescription()
        XCTAssertEqual(recoveryDesc, "Deleted items are removed through iOS PhotoKit and placed in the system 'Recently Deleted' album, with recovery managed by iOS and your device settings.")
        XCTAssertFalse(recoveryDesc.contains("30 days"), "Recovery description must NOT promise a fixed 30 days window")
        XCTAssertTrue(recoveryDesc.contains("Recently Deleted"), "Recovery description must mention Recently Deleted")
        XCTAssertTrue(recoveryDesc.contains("iOS"), "Must make clear that recovery is managed by iOS")
    }

    func testProtectedItemCommitBypass() {
        let commitAdapter = IOSCommitAdapter()
        let expectation = self.expectation(description: "Batch commit protected item")
        
        let protectedItem: [String: Any] = [
            "mediaId": "test-protected-asset-123",
            "decision": "DELETE",
            "isProtected": true
        ]
        
        commitAdapter.commitBatch(items: [protectedItem]) { summary in
            XCTAssertEqual(summary["totalRequested"] as? Int, 1)
            XCTAssertEqual(summary["denied"] as? Int, 1)
            XCTAssertEqual(summary["succeeded"] as? Int, 0)
            
            let results = summary["results"] as? [[String: Any]]
            XCTAssertEqual(results?.count, 1)
            let result = results?.first
            XCTAssertEqual(result?["outcome"] as? String, "SKIPPED")
            XCTAssertEqual(result?["reclaimedBytes"] as? Int64, 0)
            XCTAssertEqual(result?["isPlatformTrash"] as? Bool, false)
            XCTAssertTrue((result?["error"] as? String)?.contains("protected") == true)
            
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 5.0, handler: nil)
    }

    func testKeepDecisionOutcome() {
        let commitAdapter = IOSCommitAdapter()
        let expectation = self.expectation(description: "Batch commit keep item")
        
        let keepItem: [String: Any] = [
            "mediaId": "test-keep-asset-1",
            "decision": "KEEP"
        ]
        
        commitAdapter.commitBatch(items: [keepItem]) { summary in
            XCTAssertEqual(summary["totalRequested"] as? Int, 1)
            XCTAssertEqual(summary["succeeded"] as? Int, 1)
            XCTAssertEqual(summary["failed"] as? Int, 0)
            XCTAssertEqual(summary["denied"] as? Int, 0)
            XCTAssertEqual(summary["totalReclaimedBytes"] as? Int64, 0)
            
            let results = summary["results"] as? [[String: Any]]
            let result = results?.first
            XCTAssertEqual(result?["outcome"] as? String, "KEPT")
            XCTAssertEqual(result?["reclaimedBytes"] as? Int64, 0)
            XCTAssertEqual(result?["isPlatformTrash"] as? Bool, false)
            
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 5.0, handler: nil)
    }

    func testStagedCandidateMissingPreValidation() {
        let commitAdapter = IOSCommitAdapter()
        let expectation = self.expectation(description: "Batch commit missing staged file")
        
        let compressItem: [String: Any] = [
            "mediaId": "test-asset-missing-staged",
            "decision": "COMPRESS",
            "candidate": [
                "stagedPath": "/nonexistent/path/candidate.jpg",
                "measuredSavingsBytes": 2048
            ]
        ]
        
        commitAdapter.commitBatch(items: [compressItem]) { summary in
            XCTAssertEqual(summary["totalRequested"] as? Int, 1)
            XCTAssertEqual(summary["failed"] as? Int, 1)
            XCTAssertEqual(summary["succeeded"] as? Int, 0)
            
            let results = summary["results"] as? [[String: Any]]
            let result = results?.first
            XCTAssertEqual(result?["outcome"] as? String, "FAILED")
            XCTAssertEqual(result?["reclaimedBytes"] as? Int64, 0)
            XCTAssertEqual(result?["isPlatformTrash"] as? Bool, false)
            XCTAssertTrue((result?["error"] as? String)?.contains("does not exist") == true)
            
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 5.0, handler: nil)
    }

    func testMissingCompressionCandidateDictFails() {
        let commitAdapter = IOSCommitAdapter()
        let expectation = self.expectation(description: "Batch commit missing candidate dict")
        
        let compressItem: [String: Any] = [
            "mediaId": "test-asset-no-candidate",
            "decision": "COMPRESS"
        ]
        
        commitAdapter.commitBatch(items: [compressItem]) { summary in
            XCTAssertEqual(summary["totalRequested"] as? Int, 1)
            XCTAssertEqual(summary["failed"] as? Int, 1)
            
            let results = summary["results"] as? [[String: Any]]
            let result = results?.first
            XCTAssertEqual(result?["outcome"] as? String, "FAILED")
            XCTAssertTrue((result?["error"] as? String)?.contains("Missing compression candidate") == true)
            
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 5.0, handler: nil)
    }

    func testUnknownDecisionOutcome() {
        let commitAdapter = IOSCommitAdapter()
        let expectation = self.expectation(description: "Batch commit unknown decision")
        
        let unknownItem: [String: Any] = [
            "mediaId": "test-unknown-decision",
            "decision": "INVALID_DECISION"
        ]
        
        commitAdapter.commitBatch(items: [unknownItem]) { summary in
            XCTAssertEqual(summary["totalRequested"] as? Int, 1)
            XCTAssertEqual(summary["failed"] as? Int, 1)
            
            let results = summary["results"] as? [[String: Any]]
            let result = results?.first
            XCTAssertEqual(result?["outcome"] as? String, "SKIPPED")
            XCTAssertTrue((result?["error"] as? String)?.contains("Unknown triage decision") == true)
            
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 5.0, handler: nil)
    }

    // MARK: - 6. UTI MIME Mapping Tests

    func testMimeTypeFromUTI() {
        let adapter = PhotoKitAdapter()
        XCTAssertEqual(adapter.mimeTypeFromUTI("public.jpeg"), "image/jpeg")
        XCTAssertEqual(adapter.mimeTypeFromUTI("public.jpg"), "image/jpeg")
        XCTAssertEqual(adapter.mimeTypeFromUTI("public.png"), "image/png")
        XCTAssertEqual(adapter.mimeTypeFromUTI("public.heic"), "image/heic")
        XCTAssertEqual(adapter.mimeTypeFromUTI("org.webmproject.webp"), "image/webp")
        XCTAssertEqual(adapter.mimeTypeFromUTI("public.webp"), "image/webp")
        XCTAssertEqual(adapter.mimeTypeFromUTI("public.mpeg-4"), "video/mp4")
        XCTAssertEqual(adapter.mimeTypeFromUTI("com.apple.quicktime-movie"), "video/quicktime")
        XCTAssertEqual(adapter.mimeTypeFromUTI("unknown.custom.format"), "application/octet-stream")
    }
}
