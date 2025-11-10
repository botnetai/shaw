//
//  UserSettings.swift
//  AI Voice Copilot
//

import Foundation

class UserSettings: ObservableObject {
    @Published var loggingEnabled: Bool {
        didSet {
            UserDefaults.standard.set(loggingEnabled, forKey: "loggingEnabled")
        }
    }
    
    @Published var retentionDays: Int {
        didSet {
            UserDefaults.standard.set(retentionDays, forKey: "retentionDays")
        }
    }
    
    @Published var hasSeenOnboarding: Bool {
        didSet {
            UserDefaults.standard.set(hasSeenOnboarding, forKey: "hasSeenOnboarding")
        }
    }
    
    static let shared = UserSettings()
    
    // Retention options: 0 = Never delete, > 0 = number of days
    
    private init() {
        self.loggingEnabled = UserDefaults.standard.bool(forKey: "loggingEnabled")

        // Check if retentionDays key exists to distinguish between "not set" (default to 30) and "set to 0" (never delete)
        if UserDefaults.standard.object(forKey: "retentionDays") != nil {
            self.retentionDays = UserDefaults.standard.integer(forKey: "retentionDays")
        } else {
            self.retentionDays = 30 // Default to 30 days if not set
        }

        self.hasSeenOnboarding = UserDefaults.standard.bool(forKey: "hasSeenOnboarding")
    }
}

