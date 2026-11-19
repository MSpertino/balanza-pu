#include <Arduino.h>
#include <HX711.h>
#include <Adafruit_NeoPixel.h>
#include <Preferences.h>

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

constexpr uint32_t HEARTBEAT_MS = 1000;
constexpr uint32_t LED_MS = 500;
constexpr uint8_t HX711_DOUT = 2;
constexpr uint8_t HX711_SCK = 22;
constexpr uint8_t STRIP_DATA = 25;
constexpr uint16_t STRIP_LEDS = 14;
constexpr uint8_t STRIP_BRIGHTNESS = 64;
constexpr uint32_t TRAFFIC_RED_MS = 5000;
constexpr uint32_t TRAFFIC_GREEN_MS = 5000;
constexpr uint32_t TRAFFIC_YELLOW_MS = 2000;
constexpr uint32_t HX711_TIMEOUT_MS = 1000;
constexpr uint32_t READ_INTERVAL_MS = 500;

HX711 scale;
Adafruit_NeoPixel strip(STRIP_LEDS, STRIP_DATA, NEO_GRB + NEO_KHZ800);
Preferences preferences;
long tareOffset = 0;
float scaleFactor = 1.0f;
uint32_t lastRead = 0;
uint32_t lastTimeout = 0;

uint32_t lastHeartbeat = 0;
uint32_t lastLedChange = 0;
bool ledState = false;

enum class TrafficColor : uint8_t {
  Red,
  Green,
  Yellow
};

TrafficColor trafficColor = TrafficColor::Red;
uint32_t trafficChangedAt = 0;

void setTrafficColor(TrafficColor color) {
  trafficColor = color;
  switch (color) {
    case TrafficColor::Red:
      strip.fill(strip.Color(255, 0, 0));
      break;
    case TrafficColor::Green:
      strip.fill(strip.Color(0, 255, 0));
      break;
    case TrafficColor::Yellow:
      strip.fill(strip.Color(255, 100, 0));
      break;
  }
  strip.show();
  trafficChangedAt = millis();
}

void updateTrafficLight(uint32_t now) {
  const uint32_t duration = trafficColor == TrafficColor::Red
      ? TRAFFIC_RED_MS
      : trafficColor == TrafficColor::Green
          ? TRAFFIC_GREEN_MS
          : TRAFFIC_YELLOW_MS;

  if (now - trafficChangedAt < duration) return;

  if (trafficColor == TrafficColor::Red) setTrafficColor(TrafficColor::Green);
  else if (trafficColor == TrafficColor::Green) setTrafficColor(TrafficColor::Yellow);
  else setTrafficColor(TrafficColor::Red);
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.begin(115200);

  strip.begin();
  strip.setBrightness(STRIP_BRIGHTNESS);
  setTrafficColor(TrafficColor::Red);

  scale.begin(HX711_DOUT, HX711_SCK);
  preferences.begin("hx711-test", false);
  tareOffset = preferences.getLong("tare", 0);
  scaleFactor = preferences.getFloat("factor", 1.0f);

  delay(500);
  Serial.println();
  Serial.println("=== TEST ESP32 + HX711 ===");
  Serial.println("ESP32 arrancado correctamente");
  Serial.printf("HX711 DOUT=GPIO%d SCK=GPIO%d\n", HX711_DOUT, HX711_SCK);
  Serial.printf("Tira LED: datos=GPIO%d cantidad=%d\n", STRIP_DATA, STRIP_LEDS);
  Serial.println("Comandos: T=tare, R=raw, C <gramos>=calibrar, S=estado");
  Serial.println("Conectar celda y HX711 antes de usar T o C");
}

void loop() {
  const uint32_t now = millis();

  updateTrafficLight(now);

  if (now - lastLedChange >= LED_MS) {
    lastLedChange = now;
    ledState = !ledState;
    digitalWrite(LED_BUILTIN, ledState ? HIGH : LOW);
  }

  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    Serial.printf("heartbeat uptime_ms=%lu led=%d\n", static_cast<unsigned long>(now), ledState ? 1 : 0);
  }

  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command.equalsIgnoreCase("T")) {
      if (!scale.is_ready()) {
        Serial.println("ERROR: HX711 no responde; no se puede tarar");
      } else {
        tareOffset = scale.read_average(10);
        preferences.putLong("tare", tareOffset);
        Serial.printf("TARE_OK offset=%ld\n", tareOffset);
      }
    } else if (command.equalsIgnoreCase("R")) {
      if (!scale.is_ready()) Serial.println("HX711_NOT_READY");
      else Serial.printf("RAW=%ld\n", scale.read());
    } else if (command.equalsIgnoreCase("S")) {
      Serial.printf("STATUS ready=%s tare=%ld factor=%.6f\n", scale.is_ready() ? "true" : "false", tareOffset, scaleFactor);
    } else if (command.startsWith("C ") || command.startsWith("c ")) {
      float grams = command.substring(2).toFloat();
      if (!scale.is_ready()) Serial.println("ERROR: HX711 no responde; no se puede calibrar");
      else if (grams <= 0) Serial.println("ERROR: usar C <gramos>");
      else {
        long reading = scale.read_average(10);
        scaleFactor = (reading - tareOffset) / grams;
        preferences.putFloat("factor", scaleFactor);
        Serial.printf("CAL_OK factor=%.6f\n", scaleFactor);
      }
    } else if (command.length()) {
      Serial.println("Comando invalido. Usar T, R, C <gramos> o S");
    }
  }

  if (now - lastRead >= READ_INTERVAL_MS) {
    lastRead = now;
    if (scale.is_ready()) {
      const long raw = scale.read();
      const float grams = (raw - tareOffset) / scaleFactor;
      Serial.printf("HX711 raw=%ld grams=%.2f\n", raw, grams);
    } else if (now - lastTimeout >= HX711_TIMEOUT_MS) {
      lastTimeout = now;
      Serial.println("HX711_NOT_READY (normal si esta desconectado)");
    }
  }
}

