import Capacitor
import PassKit
import UIKit

@objc(LovalteWalletPlugin)
public class LovalteWalletPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LovalteWalletPlugin"
    public let jsName = "LovalteWallet"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "canAddPasses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addPass", returnType: CAPPluginReturnPromise)
    ]

    @objc func canAddPasses(_ call: CAPPluginCall) {
        call.resolve(["value": PKAddPassesViewController.canAddPasses()])
    }

    @objc func addPass(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing pass URL")
            return
        }

        var request = URLRequest(url: url)
        if let token = call.getString("token"), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                call.reject("Could not download Wallet pass", nil, error)
                return
            }

            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                call.reject("Wallet pass download failed with status \(http.statusCode)")
                return
            }

            guard let data = data else {
                call.reject("Wallet pass download was empty")
                return
            }

            do {
                let pass = try PKPass(data: data)
                DispatchQueue.main.async {
                    guard PKAddPassesViewController.canAddPasses() else {
                        call.reject("This device cannot add Wallet passes")
                        return
                    }

                    guard let controller = PKAddPassesViewController(pass: pass) else {
                        call.reject("Could not prepare Wallet pass")
                        return
                    }

                    self.bridge?.viewController?.present(controller, animated: true) {
                        call.resolve(["presented": true])
                    }
                }
            } catch {
                call.reject("Downloaded file is not a valid Wallet pass", nil, error)
            }
        }.resume()
    }
}
