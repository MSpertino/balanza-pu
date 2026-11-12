#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>
#include <math.h>

// Pines confirmados fisicamente segun el diagrama de Lionel.
constexpr int PIN_DOUT = 23;
constexpr int PIN_SCK = 22;
constexpr int PIN_BUTTON = 25; // Pulsador entre GPIO 25 y GND (activo en LOW).
constexpr unsigned long BUTTON_DEBOUNCE_MS = 30;
bool buttonPressed = false;
bool buttonCandidate = false;
unsigned long buttonChangedAt = 0;
constexpr size_t WINDOW = 10;
constexpr float STABLE_RANGE_G = 1.0f; // Umbral inicial, no precision certificada.
HX711 scale;
Preferences settings;
long samples[WINDOW] = {};
size_t sampleCount = 0, sampleIndex = 0;
long zeroOffset = 0;
float countsPerGram = 0;
bool tared = false;
enum class Operation { None, Tare, Calibrate };
Operation operation = Operation::None;
int collected = 0;
int64_t sum = 0;
float referenceGrams = 0;
unsigned long operationStarted = 0, lastSample = 0, lastReport = 0;
String command;

void updateButton(unsigned long now) {
  bool pressed = digitalRead(PIN_BUTTON) == LOW;
  if (pressed != buttonCandidate) {
    buttonCandidate = pressed;
    buttonChangedAt = now;
  }
  if (now - buttonChangedAt >= BUTTON_DEBOUNCE_MS) buttonPressed = buttonCandidate;
}

void event(const char *name) {
  Serial.printf("{\"event\":\"%s\"}\n", name);
}

void startOperation(Operation next) {
  operation = next;
  collected = 0;
  sum = 0;
  operationStarted = millis();
  sampleCount = 0;
  event(next == Operation::Tare ? "tare_started" : "calibration_started");
}

void handleCommand(String input) {
  input.trim();
  if (!input.length()) return;
  if (operation != Operation::None) { event("busy"); return; }
  if (input == "T" || input == "t") {
    startOperation(Operation::Tare);
  } else if (input.startsWith("C ") || input.startsWith("c ")) {
    if (!tared) { event("tare_required"); return; }
    const char *value = input.c_str() + 2;
    char *end = nullptr;
    referenceGrams = strtof(value, &end);
    if (end == value || *end != '\0' || !isfinite(referenceGrams) || referenceGrams <= 0) {
      event("invalid_reference_grams"); return;
    }
    startOperation(Operation::Calibrate);
  } else if (input.length()) {
    event("commands_T_or_C_space_grams");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  settings.begin("balanza", false);
  countsPerGram = settings.getFloat("counts_g", 0);
  if (!isfinite(countsPerGram)) countsPerGram = 0;
  scale.begin(PIN_DOUT, PIN_SCK);
  lastSample = millis();
  event("ready_tare_empty_scale_with_T");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { handleCommand(command); command = ""; }
    else if (command.length() < 64) command += c;
    else { command = ""; event("command_too_long"); }
  }
  unsigned long now = millis();
  updateButton(now);
  if (operation != Operation::None && now - operationStarted > 5000) {
    operation = Operation::None;
    event("operation_timeout");
  }
  if (scale.is_ready()) {
    long raw = scale.read();
    lastSample = now;
    if (raw <= -8388607L || raw >= 8388606L) {
      operation = Operation::None;
      sampleCount = 0;
      if (now - lastReport >= 100) {
        lastReport = now;
        Serial.printf("{\"g\":null,\"raw\":%ld,\"stable\":false,\"btn\":%s,\"error\":\"hx711_saturated\"}\n", raw, buttonPressed ? "true" : "false");
      }
      delay(1);
      return;
    }
    samples[sampleIndex] = raw;
    sampleIndex = (sampleIndex + 1) % WINDOW;
    if (sampleCount < WINDOW) ++sampleCount;
    if (operation != Operation::None) {
      sum += raw;
      if (++collected == static_cast<int>(WINDOW)) {
        long average = static_cast<long>(sum / WINDOW);
        if (operation == Operation::Tare) {
          zeroOffset = average;
          tared = true;
          event("tare_done");
        } else {
          float factor = (static_cast<double>(average) - zeroOffset) / referenceGrams;
          if (isfinite(factor) && fabsf(factor) > 0.000001f) {
            countsPerGram = factor;
            if (settings.putFloat("counts_g", factor) == sizeof(float)) event("calibration_saved");
            else event("calibration_active_but_not_saved");
          } else event("calibration_failed_no_signal");
        }
        operation = Operation::None;
        sampleCount = 0;
      }
    }
    if (now - lastReport >= 100) {
      lastReport = now;
      bool calibrated = countsPerGram != 0;
      bool valid = calibrated && tared && operation == Operation::None;
      bool stable = false;
      if (valid && sampleCount == WINDOW) {
        long low = samples[0], high = samples[0];
        for (size_t i = 1; i < WINDOW; ++i) {
          if (samples[i] < low) low = samples[i];
          if (samples[i] > high) high = samples[i];
        }
        stable = (static_cast<double>(high) - low) / fabsf(countsPerGram) <= STABLE_RANGE_G;
      }
      Serial.print("{\"g\":");
      if (valid) Serial.print((static_cast<double>(raw) - zeroOffset) / countsPerGram, 2);
      else Serial.print("null");
      Serial.printf(",\"raw\":%ld,\"stable\":%s,\"btn\":%s,\"calibrated\":%s,\"tared\":%s}\n",
                    raw, stable ? "true" : "false", buttonPressed ? "true" : "false", calibrated ? "true" : "false", tared ? "true" : "false");
    }
  } else if (now - lastSample >= 2000 && now - lastReport >= 1000) {
    lastReport = now;
    Serial.printf("{\"g\":null,\"raw\":null,\"stable\":false,\"btn\":%s,\"error\":\"hx711_timeout\"}\n", buttonPressed ? "true" : "false");
  }
  delay(1);
}
