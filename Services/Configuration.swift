//
//  Configuration.swift
//  AI Voice Copilot
//

import Foundation

enum Environment {
    case development
    case staging
    case production

    static var current: Environment {
        #if DEBUG
        return .development
        #else
        return .production
        #endif
    }
}

struct Configuration {
    static let shared = Configuration()

    private init() {}

    var apiBaseURL: String {
        switch Environment.current {
        case .development:
            return ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:3000/v1"
        case .staging:
            return ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "https://api-staging.example.com/v1"
        case .production:
            return ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "https://api.example.com/v1"
        }
    }

    var authLoginURL: String {
        return "\(apiBaseURL)/auth/login"
    }

    var authRefreshURL: String {
        return "\(apiBaseURL)/auth/refresh"
    }

    var isLoggingEnabled: Bool {
        switch Environment.current {
        case .development:
            return true
        case .staging:
            return true
        case .production:
            return UserSettings.shared.loggingEnabled
        }
    }

    func printConfiguration() {
        print("""
        ================================================
        AI Voice Copilot Configuration
        ================================================
        Environment: \(Environment.current)
        API Base URL: \(apiBaseURL)
        Auth Login URL: \(authLoginURL)
        Logging Enabled: \(isLoggingEnabled)
        ================================================
        """)
    }
}
