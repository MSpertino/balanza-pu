#include <Arduino.h>

// Cableado del HX711 documentado para esta balanza:
// DOUT/DT -> GPIO 23, SCK/CLK -> GPIO 22, GND -> GND.
constexpr uint8_t PIN_HX711_DOUT = 23;
constexpr uint8_t PIN_HX711_SCK = 22;

bool readHx711(long &value) {
  if (digitalRead(PIN_HX711_DOUT) != LOW) return false;

  uint32_t raw = 0;
  noInterrupts();
  for (uint8_t bit = 0; bit < 24; ++bit) {
    digitalWrite(PIN_HX711_SCK, HIGH);
    delayMicroseconds(1);
    raw = (raw << 1) | (digitalRead(PIN_HX711_DOUT) == HIGH ? 1U : 0U);
    digitalWrite(PIN_HX711_SCK, LOW);
    delayMicroseconds(1);
  }

  // Pulso 25: selecciona canal A con ganancia 128 para la siguiente lectura.
  digitalWrite(PIN_HX711_SCK, HIGH);
  delayMicroseconds(1);
  digitalWrite(PIN_HX711_SCK, LOW);
  interrupts();

  if (raw & 0x800000UL) raw |= 0xFF000000UL;
  value = static_cast<int32_t>(raw);
  return true;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_HX711_DOUT, INPUT);
  pinMode(PIN_HX711_SCK, OUTPUT);
  digitalWrite(PIN_HX711_SCK, LOW);
  Serial.println("Prueba ESP32 + HX711 lista. Lectura cruda cada 200 ms.");
  Serial.println("Conecta DOUT a GPIO 23 y SCK a GPIO 22.");
}

void loop() {
  static unsigned long lastReport = 0;
  static bool reportedTimeout = false;
  const unsigned long now = millis();
  long raw = 0;

  if (readHx711(raw)) {
    if (now - lastReport >= 200) {
      lastReport = now;
      Serial.printf("raw=%ld\n", raw);
    }
    reportedTimeout = false;
  } else if (!reportedTimeout && now - lastReport >= 1500) {
    Serial.println("Sin lectura: revisa alimentacion, GND y DOUT del HX711.");
    reportedTimeout = true;
  }
}
