//
//  VoicePreviewService.swift
//  AI Voice Copilot
//

import Foundation
import AVFoundation
import Combine

/// Service for generating and caching voice preview audio samples
@MainActor
class VoicePreviewService: NSObject, ObservableObject {
    static let shared = VoicePreviewService()
    
    private let previewText = "Hello, this is a preview of my voice. How do I sound?"
    private var audioPlayers: [String: AVAudioPlayer] = [:]
    private var previewCache: [String: URL] = [:]
    @Published var playingVoiceId: String?
    
    private override init() {
        super.init()
    }
    
    /// Generate or retrieve cached preview URL for a voice
    func getPreviewURL(for voice: TTSVoice) async throws -> URL {
        let cacheKey = voice.id
        
        // Check if already cached
        if let cachedURL = previewCache[cacheKey] {
            return cachedURL
        }
        
        // Generate preview via backend
        let url = try await generatePreview(voice: voice)
        previewCache[cacheKey] = url
        return url
    }
    
    /// Play preview for a voice
    func playPreview(for voice: TTSVoice) async throws {
        let cacheKey = voice.id
        
        // Stop any currently playing preview
        stopAllPreviews()
        
        // Get or generate preview URL
        let previewURL = try await getPreviewURL(for: voice)
        
        // Create and play audio player
        let player = try AVAudioPlayer(contentsOf: previewURL)
        player.delegate = self
        player.prepareToPlay()
        audioPlayers[cacheKey] = player
        playingVoiceId = cacheKey
        player.play()
    }
    
    /// Stop preview for a specific voice
    func stopPreview(for voice: TTSVoice) {
        let cacheKey = voice.id
        audioPlayers[cacheKey]?.stop()
        audioPlayers[cacheKey] = nil
        if playingVoiceId == cacheKey {
            playingVoiceId = nil
        }
    }
    
    /// Stop all playing previews
    func stopAllPreviews() {
        audioPlayers.values.forEach { $0.stop() }
        audioPlayers.removeAll()
        playingVoiceId = nil
    }
    
    /// Check if a preview is currently playing for a voice
    func isPlaying(for voice: TTSVoice) -> Bool {
        let cacheKey = voice.id
        return playingVoiceId == cacheKey && (audioPlayers[cacheKey]?.isPlaying ?? false)
    }
    
    /// Get preview audio URL (pre-generated static file)
    private func generatePreview(voice: TTSVoice) async throws -> URL {
        let configuration = Configuration.shared

        // Determine file extension based on provider
        let fileExtension = voice.provider == .cartesia ? "wav" : "mp3"

        // Construct URL to static preview file
        // Use the API endpoint that serves static files
        guard let baseURL = URL(string: configuration.apiBaseURL) else {
            throw VoicePreviewError.invalidURL
        }

        // Get base URL without /v1 suffix
        var basePath = baseURL.absoluteString
        if basePath.hasSuffix("/v1") {
            basePath = String(basePath.dropLast(3))
        }
        // Ensure no trailing slash
        if basePath.hasSuffix("/") {
            basePath = String(basePath.dropLast())
        }

        // Use the static file endpoint: /voice-previews/{voiceId}.{ext}
        guard let previewURL = URL(string: "\(basePath)/voice-previews/\(voice.id).\(fileExtension)") else {
            throw VoicePreviewError.invalidURL
        }

        // Download and cache the preview file
        let (data, response) = try await URLSession.shared.data(from: previewURL)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw VoicePreviewError.generationFailed
        }

        // Save to temporary file for playback
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "\(voice.id)-preview.\(fileExtension)"
        let fileURL = tempDir.appendingPathComponent(fileName)

        try data.write(to: fileURL)
        return fileURL
    }
}

extension VoicePreviewService: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            // Find and remove the finished player
            if let voiceId = playingVoiceId, audioPlayers[voiceId] === player {
                audioPlayers[voiceId] = nil
                playingVoiceId = nil
            }
        }
    }
    
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            if let voiceId = playingVoiceId, audioPlayers[voiceId] === player {
                audioPlayers[voiceId] = nil
                playingVoiceId = nil
            }
        }
    }
}

enum VoicePreviewError: LocalizedError {
    case invalidURL
    case generationFailed
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid preview URL"
        case .generationFailed:
            return "Failed to generate voice preview"
        }
    }
}

