import { createClient } from "redis";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { performance } from "perf_hooks";

// Конфигурация AES-256-CBC
const algorithm = "aes-256-cbc";
const key = crypto.randomBytes(32); // 256 бит ключа
const iv = crypto.randomBytes(16); // Вектор инициализации

// Функция шифрования для генерации 64-символьного хэша
function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

const client = createClient({
  url: "redis://localhost:6379",
});

let savedUsers = [];  // Сохраняем всех пользователей при генерации данных

// Функция для создания данных и записи их в Redis
async function createData() {

  const createOrganizationCount = 1000;
  try {
    await client.connect();
    for (let i = 0; i < createOrganizationCount; i++) {
      const orgId = new ObjectId().toString();
      const userCount = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
      const users = Array.from({ length: userCount }, (_, j) => encrypt(`user_${i}_${j}`));

      // Запись в test_kv (userID → orgID)
      for (const userId of users) {
        await client.set(`test_kv:${userId}`, orgId); 
        savedUsers.push({ userId, orgId });  // Сохраняем пользователей для теста
      }

      // Запись в test_json (orgID → массив userID)
      await client.json.set(`test_json:${orgId}`, "$", users);
      console.log(`Organization ${orgId} with ${userCount} users added to Redis.`);
    }
    console.log("-- Data creation complete. -- ");
    console.log("Created users count:", savedUsers.length);
    console.log("Created organizations count:", createOrganizationCount);
  } catch (err) {
    console.error("Error during data creation:", err);
  } finally {
    await client.disconnect();
  }
}

// Функция для замера времени выполнения запроса
async function measureExecutionTime(queryFunction, ...args) {
  const start = performance.now();
  const result = await queryFunction(...args);
  const end = performance.now();
  return { result, time: end - start };
}

// Запрос для проверки в `test_kv` (userID → orgID)
async function checkTestKV(userId, expectedOrgId) {
  const orgId = await client.get(`test_kv:${userId}`);
  return orgId === expectedOrgId;
}

// Запрос для проверки в `test_json` (orgID → [userID, userID, ...])
async function checkTestJSON(orgId, userId) {
  const index = await client.json.arrIndex(`test_json:${orgId}`, '$' , userId);
  return index !== -1;
}

// Функция для тестирования времени ответа Redis
async function testRedis() {
  let totalTimeKv = 0;
  let totalTimeJson = 0;

  try {
    await client.connect();
    const testsCount = 10000;
    for (let i = 0; i < testsCount; i++) {
      const randomUser = savedUsers[Math.floor(Math.random() * savedUsers.length)];
      const { userId, orgId } = randomUser;

      // Замер времени для `test_kv`
      const { time: timeKv } = await measureExecutionTime(checkTestKV, userId, orgId);
      totalTimeKv += timeKv;

      // Замер времени для `test_json`
      const { time: timeJson } = await measureExecutionTime(checkTestJSON, orgId, userId);
      totalTimeJson += timeJson;
    }

    // Рассчитываем среднее время запроса
    const avgTimeKv = totalTimeKv / 1000;
    const avgTimeJson = totalTimeJson / 1000;
    console.log(`-- Finish! --`);
    console.log(`Tests count: ${testsCount}`);
    console.log(`Average time for test_kv (Plain Key-Value): ${avgTimeKv.toFixed(5)} ms`);
    console.log(`Average time for test_json (ARRINDEX in JSON array): ${avgTimeJson.toFixed(5)} ms`);
  } catch (err) {
    console.error("Error during Redis testing:", err);
  } finally {
    await client.disconnect();
  }
}

// Запуск создания данных и последующего тестирования
(async () => {
  await createData();
  await testRedis();
})();
