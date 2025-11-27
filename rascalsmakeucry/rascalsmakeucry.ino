#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// --- DEFINISI PIN SESUAI RINGKASAN ---
#define DHT_PIN 4
#define DHT_TYPE DHT11 // Menggunakan DHT11

// Sensor MQ-X (Udara/Gas)
#define MQ_AO_PIN 34 // Analog
#define MQ_DO_PIN 27 // Digital

// Sensor LDR (Cahaya)
#define LDR_AO_PIN 35 // Analog
#define LDR_DO_PIN 26 // Digital

// Sensor Suara (Microphone)
#define SOUND_AO_PIN 32 // Analog
#define SOUND_DO_PIN 25 // Digital

// --- OBJEK & VARIABEL GLOBAL ---
DHT dht(DHT_PIN, DHT_TYPE);
WiFiManager wm;
HTTPClient http;

// Ganti dengan URL API Next.js Anda nanti
// Ganti dengan URL Vercel Anda
String SERVER_URL = "https://your-project-name.vercel.app/api/iot";
// Interval pengiriman data (dalam milidetik)
const unsigned long SENSOR_READ_INTERVAL = 5000; // 5 detik
unsigned long lastSensorReadTime = 0;

// --- FUNGSI BARU UNTUK MENCETAK DATA KE SERIAL MONITOR SECARA RAPI ---
void printSensorData(float temperature, float humidity, int gasAnalog, int gasDigital, int lightAnalog, int lightDigital, int soundAnalog, int soundDigital) {
  Serial.println("\n======================================");
  Serial.println("      DATA SENSOR TERBARU");
  Serial.println("======================================");
  
  Serial.print("Suhu\t\t: ");
  Serial.print(temperature);
  Serial.println(" *C");

  Serial.print("Kelembaban\t: ");
  Serial.print(humidity);
  Serial.println(" %");

  Serial.println("--------------------------------------");
  Serial.print("Gas (Analog)\t: ");
  Serial.println(gasAnalog);
  Serial.print("Gas (Digital)\t: ");
  Serial.println(gasDigital == 0 ? "TERDETEKSI" : "AMAN");

  Serial.println("--------------------------------------");
  Serial.print("Cahaya (Analog)\t: ");
  Serial.println(lightAnalog);
  Serial.print("Cahaya (Digital)\t: ");
  Serial.println(lightDigital == 0 ? "GELAP" : "TERANG");

  Serial.println("--------------------------------------");
  Serial.print("Suara (Analog)\t: ");
  Serial.println(soundAnalog);
  Serial.print("Suara (Digital)\t: ");
  Serial.println(soundDigital == 0 ? "BISING" : "HENING");
  
  Serial.println("======================================\n");
}

// Fungsi untuk membaca semua sensor dan membuat JSON
String readSensorData() {
  // Baca sensor DHT
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  // Cek jika pembacaan DHT gagal
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Gagal membaca data dari sensor DHT!");
    return "{\"error\":\"DHT read failed\"}";
  }

  // Baca semua sensor ANALOG (nilai 0-4095)
  int gasAnalog = analogRead(MQ_AO_PIN);
  int lightAnalog = analogRead(LDR_AO_PIN);
  int soundAnalog = analogRead(SOUND_AO_PIN);

  // Baca semua sensor DIGITAL (nilai 0 atau 1)
  int gasDigital = digitalRead(MQ_DO_PIN);
  int lightDigital = digitalRead(LDR_DO_PIN);
  int soundDigital = digitalRead(SOUND_DO_PIN);

  // --- PANGGIL FUNGSI UNTUK MENCETAK KE SERIAL MONITOR ---
  printSensorData(temperature, humidity, gasAnalog, gasDigital, lightAnalog, lightDigital, soundAnalog, soundDigital);

  // Buat dokumen JSON untuk dikirim
  DynamicJsonDocument doc(1024);
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  
  // Data dari sensor MQ-X
  doc["gas"]["analog"] = gasAnalog;
  doc["gas"]["digital"] = gasDigital;

  // Data dari sensor LDR
  doc["light"]["analog"] = lightAnalog;
  doc["light"]["digital"] = lightDigital;

  // Data dari sensor Suara
  doc["sound"]["analog"] = soundAnalog;
  doc["sound"]["digital"] = soundDigital;

  doc["deviceId"] = WiFi.macAddress(); // ID unik per device

  String jsonString;
  serializeJson(doc, jsonString);
  return jsonString;
}

// ==========================================================
// ===========    PERHATIKAN BAGIAN INI    ==================
// ==========================================================
void setup() {
  Serial.begin(115200);
  dht.begin();

  // Set pin digital sebagai INPUT dengan PULLUP internal
  pinMode(MQ_DO_PIN, INPUT_PULLUP);
  pinMode(LDR_DO_PIN, INPUT_PULLUP);
  pinMode(SOUND_DO_PIN, INPUT_PULLUP);

  // --- Konfigurasi WiFi Manager ---
  WiFiManagerParameter custom_server_url("server_url", "Next.js API URL", SERVER_URL.c_str(), 50);
  wm.addParameter(&custom_server_url);

  Serial.println("Menghubungkan ke Wi-Fi...");
  
  if (!wm.autoConnect("ESP32-Sensor-Setup", "password123")) {
    Serial.println("Gagal terhubung dan timed out.");
    delay(3000);
    // ESP.restart(); // Anda bisa menambahkan ini jika ingin auto-restart
  }

  Serial.println("Berhasil terhubung ke Wi-Fi!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  SERVER_URL = String(custom_server_url.getValue());
  Serial.print("Server URL akan dikirim ke: ");
  Serial.println(SERVER_URL);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi terputus, mencoba menghubungkan kembali...");
    // Tidak perlu wm.autoConnect() di sini, akan otomatis reconnect
  }

  unsigned long currentTime = millis();
  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentTime;

    String sensorData = readSensorData(); // Di dalam fungsi ini, data sudah dicetak ke serial

    if (WiFi.status() == WL_CONNECTED && SERVER_URL.indexOf("YOUR_NEXTJS_IP") == -1) {
      http.begin(SERVER_URL);
      http.addHeader("Content-Type", "application/json");

      Serial.print("Mengirim JSON ke server: ");
      Serial.println(sensorData);

      int httpResponseCode = http.POST(sensorData);

      if (httpResponseCode > 0) {
        Serial.print("HTTP Response code: ");
        Serial.println(httpResponseCode);
      } else {
        Serial.print("Error pada pengiriman HTTP: ");
        Serial.println(httpResponseCode);
      }

      http.end();
    } else {
      Serial.println("Menunggu koneksi Wi-Fi atau SERVER_URL belum diatur.");
    }
  }
}