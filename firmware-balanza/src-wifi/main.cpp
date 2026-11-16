#include <Arduino.h>
#include <DNSServer.h>
#include <HX711.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>

constexpr int PIN_DOUT = 23;
constexpr int PIN_SCK = 22;
constexpr int PIN_BUTTON = 25;
constexpr unsigned long WIFI_TIMEOUT_MS = 20000;
constexpr unsigned long TELEMETRY_INTERVAL_MS = 1000;
constexpr size_t WINDOW = 10;
constexpr float STABLE_RANGE_G = 1.0f;

HX711 scale;
Preferences prefs;
WebServer portal(80);
DNSServer dns;
const byte DNS_PORT = 53;
String ssid, password, api, token, deviceId;
bool portalMode = false, registered = false, buttonPressed = false, buttonCandidate = false;
unsigned long buttonChangedAt = 0, lastTelemetry = 0, lastSample = 0, lastReport = 0;
long samples[WINDOW] = {};
size_t sampleCount = 0, sampleIndex = 0;
long zeroOffset = 0;
float countsPerGram = 0;
bool tared = false;
String command;

enum class Operation { None, Tare, Calibrate };
Operation operation = Operation::None;
int collected = 0;
int64_t sum = 0;
float referenceGrams = 0;
unsigned long operationStarted = 0;

void event(const char *name) { Serial.printf("{\"event\":\"%s\"}\n", name); }
String baseUrl() { String value = api; while (value.endsWith("/")) value.remove(value.length() - 1); return value; }

void saveConfig() {
  prefs.putString("ssid", ssid); prefs.putString("pass", password); prefs.putString("api", api);
  prefs.putString("token", token); prefs.putString("device", deviceId);
}
String esc(String value) { value.replace("&", "&amp;"); value.replace("<", "&lt;"); value.replace("\"", "&quot;"); return value; }

void portalPage() {
  String html = "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><title>Balanza Setup</title>"
    "<style>body{font-family:system-ui;max-width:540px;margin:40px auto;padding:20px}input{width:100%;padding:12px;margin:6px 0 14px;box-sizing:border-box}button{padding:12px 18px}</style>"
    "<h1>Balanza - Configuración WiFi</h1><p>Completá los datos de la red y del servidor.</p><form method='post' action='/save'>"
    "<label>SSID<input name='ssid' required value='" + esc(ssid) + "'></label>"
    "<label>Contraseña<input name='pass' type='password' value='" + esc(password) + "'></label>"
    "<label>URL API<input name='api' required placeholder='http://192.168.1.10:3000' value='" + esc(api) + "'></label>"
    "<label>ID dispositivo<input name='device' required value='" + esc(deviceId) + "'></label>"
    "<label>Token<input name='token' required value='" + esc(token) + "'></label>"
    "<button>Guardar y conectar</button></form>";
  portal.send(200, "text/html; charset=utf-8", html);
}
void savePortal() {
  ssid = portal.arg("ssid"); password = portal.arg("pass"); api = portal.arg("api"); deviceId = portal.arg("device"); token = portal.arg("token");
  api.trim(); saveConfig(); portal.send(200, "text/html; charset=utf-8", "<h1>Guardado</h1><p>Reiniciando...</p>"); delay(1000); ESP.restart();
}
void startPortal() {
  portalMode = true; WiFi.mode(WIFI_AP); WiFi.softAP("Balanza-Setup"); dns.start(DNS_PORT, "*", WiFi.softAPIP());
  portal.on("/", HTTP_GET, portalPage); portal.onNotFound(portalPage); portal.on("/save", HTTP_POST, savePortal); portal.begin();
  Serial.printf("{\"event\":\"config_portal\",\"ip\":\"%s\"}\n", WiFi.softAPIP().toString().c_str());
}
bool connectWifi() {
  if (!ssid.length() || !api.length() || !token.length() || !deviceId.length()) return false;
  WiFi.mode(WIFI_STA); WiFi.begin(ssid.c_str(), password.c_str()); unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) delay(250);
  if (WiFi.status() != WL_CONNECTED) { event("wifi_failed"); return false; }
  Serial.printf("{\"event\":\"wifi_connected\",\"ip\":\"%s\"}\n", WiFi.localIP().toString().c_str()); return true;
}

int postJson(const String &url, const String &payload) {
  HTTPClient http; int status = -1;
  if (url.startsWith("https://")) { WiFiClientSecure client; client.setInsecure(); if (!http.begin(client, url)) return -1; http.addHeader("Content-Type", "application/json"); http.addHeader("X-Device-Token", token); status = http.POST(payload); http.end(); }
  else { WiFiClient client; if (!http.begin(client, url)) return -1; http.addHeader("Content-Type", "application/json"); http.addHeader("X-Device-Token", token); status = http.POST(payload); http.end(); }
  return status;
}
void registerDevice() {
  if (registered || WiFi.status() != WL_CONNECTED) return;
  String payload = "{\"deviceId\":\"" + deviceId + "\",\"name\":\"Balanza " + deviceId + "\",\"token\":\"" + token + "\",\"firmware\":\"0.1.0-wifi\"}";
  int status = postJson(baseUrl() + "/api/devices/register", payload); registered = status >= 200 && status < 300;
  Serial.printf("{\"event\":\"device_register\",\"status\":%d,\"registered\":%s}\n", status, registered ? "true" : "false");
}
void updateButton(unsigned long now) { bool pressed = digitalRead(PIN_BUTTON) == LOW; if (pressed != buttonCandidate) { buttonCandidate = pressed; buttonChangedAt = now; } if (now - buttonChangedAt >= 30) buttonPressed = buttonCandidate; }
void sendTelemetry(long raw, bool stable) {
  if (!registered || WiFi.status() != WL_CONNECTED || millis() - lastTelemetry < TELEMETRY_INTERVAL_MS) return;
  lastTelemetry = millis(); bool calibrated = countsPerGram != 0, valid = calibrated && tared && operation == Operation::None;
  String weight = valid ? String((static_cast<double>(raw) - zeroOffset) / countsPerGram / 1000.0, 6) : "null";
  String payload = "{\"weightKg\":" + weight + ",\"stable\":" + String(stable ? "true" : "false") + ",\"calibrated\":" + String(calibrated ? "true" : "false") + ",\"tared\":" + String(tared ? "true" : "false") + ",\"button\":" + String(buttonPressed ? "true" : "false") + ",\"raw\":" + String(raw) + ",\"uptimeMs\":" + String(millis()) + "}";
  int status = postJson(baseUrl() + "/api/devices/" + deviceId + "/telemetry", payload); if (status < 200 || status >= 300) registered = false;
}
void startOperation(Operation next) { operation = next; collected = 0; sum = 0; operationStarted = millis(); sampleCount = 0; event(next == Operation::Tare ? "tare_started" : "calibration_started"); }
void handleCommand(String input) {
  input.trim(); if (!input.length()) return; if (operation != Operation::None) { event("busy"); return; }
  if (input == "T" || input == "t") startOperation(Operation::Tare);
  else if (input.startsWith("C ") || input.startsWith("c ")) { if (!tared) { event("tare_required"); return; } char *end = nullptr; referenceGrams = strtof(input.c_str() + 2, &end); if (end == input.c_str() + 2 || *end != '\0' || !isfinite(referenceGrams) || referenceGrams <= 0) { event("invalid_reference_grams"); return; } startOperation(Operation::Calibrate); }
  else event("commands_T_or_C_space_grams");
}

void setup() {
  Serial.begin(115200); pinMode(PIN_BUTTON, INPUT_PULLUP); prefs.begin("balanza", false);
  ssid = prefs.getString("ssid", ""); password = prefs.getString("pass", ""); api = prefs.getString("api", ""); token = prefs.getString("token", "demo-device-token"); deviceId = prefs.getString("device", "balanza-01");
  countsPerGram = prefs.getFloat("counts_g", 0); scale.begin(PIN_DOUT, PIN_SCK); lastSample = millis(); if (!connectWifi()) startPortal(); event("ready_tare_empty_scale_with_T");
}
void loop() {
  if (portalMode) { dns.processNextRequest(); portal.handleClient(); delay(2); return; }
  while (Serial.available()) { char c = Serial.read(); if (c == '\n' || c == '\r') { handleCommand(command); command = ""; } else if (command.length() < 64) command += c; }
  unsigned long now = millis(); updateButton(now); registerDevice(); if (operation != Operation::None && now - operationStarted > 5000) { operation = Operation::None; event("operation_timeout"); }
  if (scale.is_ready()) {
    int dout = digitalRead(PIN_DOUT); long raw = scale.read(); lastSample = now; samples[sampleIndex] = raw; sampleIndex = (sampleIndex + 1) % WINDOW; if (sampleCount < WINDOW) ++sampleCount;
    if (operation != Operation::None) {
      sum += raw;
      if (++collected == static_cast<int>(WINDOW)) {
        long average = static_cast<long>(sum / WINDOW);
        if (operation == Operation::Tare) { zeroOffset = average; tared = true; event("tare_done"); }
        else { float factor = (static_cast<double>(average) - zeroOffset) / referenceGrams; if (isfinite(factor) && fabsf(factor) > 0.000001f) { countsPerGram = factor; prefs.putFloat("counts_g", factor); event("calibration_saved"); } else event("calibration_failed_no_signal"); }
        operation = Operation::None; sampleCount = 0; sum = 0;
      }
    }
    bool stable = false; if (countsPerGram != 0 && tared && sampleCount == WINDOW) { long low = samples[0], high = samples[0]; for (size_t i = 1; i < WINDOW; ++i) { low = min(low, samples[i]); high = max(high, samples[i]); } stable = (static_cast<double>(high) - low) / fabsf(countsPerGram) <= STABLE_RANGE_G; }
    sendTelemetry(raw, stable); if (now - lastReport >= 100) { lastReport = now; Serial.printf("{\"raw\":%ld,\"stable\":%s,\"btn\":%s}\n", raw, stable ? "true" : "false", buttonPressed ? "true" : "false"); }
  } else if (now - lastSample >= 2000 && now - lastReport >= 1000) { lastReport = now; event("hx711_timeout"); }
  delay(1);
}
