import AppKit
import Foundation
import UserNotifications

struct NotificationPayload: Decodable {
    let schemaVersion: Int?
    let identifier: String
    let eventId: String?
    let replacementKey: String?
    let title: String
    let subtitle: String?
    let body: String?
    let uri: String
    let sound: Bool?
}

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        guard let payload = parsePayload() else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                NSApp.terminate(nil)
            }
            return
        }

        schedule(payload, center: center)
    }

    private func parsePayload() -> NotificationPayload? {
        let arguments = CommandLine.arguments
        guard
            let notifyIndex = arguments.firstIndex(of: "--notify"),
            arguments.indices.contains(notifyIndex + 1),
            let data = Data(base64Encoded: arguments[notifyIndex + 1])
        else {
            return nil
        }

        return try? JSONDecoder().decode(NotificationPayload.self, from: data)
    }

    private func schedule(_ payload: NotificationPayload, center: UNUserNotificationCenter) {
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else {
                DispatchQueue.main.async {
                    NSApp.terminate(nil)
                }
                return
            }

            let content = UNMutableNotificationContent()
            content.title = payload.title
            content.subtitle = payload.subtitle ?? ""
            content.body = payload.body ?? ""
            content.categoryIdentifier = "CODEX_AGENT_NOTIFICATION"
            content.userInfo = self.userInfo(for: payload)
            if payload.sound ?? true {
                content.sound = UNNotificationSound.default
            }

            center.removePendingNotificationRequests(withIdentifiers: [payload.identifier])
            center.removeDeliveredNotifications(withIdentifiers: [payload.identifier])
            center.add(
                UNNotificationRequest(identifier: payload.identifier, content: content, trigger: nil)
            ) { _ in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    NSApp.terminate(nil)
                }
            }
        }
    }

    private func userInfo(for payload: NotificationPayload) -> [String: Any] {
        var userInfo: [String: Any] = [
            "uri": payload.uri,
            "identifier": payload.identifier
        ]
        if let eventId = payload.eventId {
            userInfo["eventId"] = eventId
        }
        if let replacementKey = payload.replacementKey {
            userInfo["replacementKey"] = replacementKey
        }
        return userInfo
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if
            let uriString = response.notification.request.content.userInfo["uri"] as? String,
            let url = URL(string: uriString)
        {
            NSWorkspace.shared.open(url)
        }
        completionHandler()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            NSApp.terminate(nil)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(macOS 11.0, *) {
            completionHandler([.banner, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
