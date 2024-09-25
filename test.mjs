import { createClient } from "redis";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { performance } from "perf_hooks";
import dotenv from "dotenv";

dotenv.config();


const algorithm = "aes-256-cbc";
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

const client = createClient({
  url: process.env.REDIS_URL,
});

let savedUsers = []; 

async function createData() {
  const createOrganizationCount =  process.env.ORGANIZATIOS_COUNT || 10;
  try {
    await client.connect();
    for (let i = 0; i < createOrganizationCount; i++) {
      const orgId = new ObjectId().toString();
      const userCount = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
      const users = Array.from({ length: userCount }, (_, j) =>
        encrypt(`user_${i}_${j}`)
      );

      if (process.env.TEST_KV === "true") {
        for (const userId of users) {
          await client.set(`test_kv:${userId}`, orgId);
        }
      }

      for (const userId of users) {
        savedUsers.push({ userId, orgId });
      }

      if (process.env.TEST_JSON === "true") {
        await client.json.set(`test_json:${orgId}`, "$", users);
      }
      console.log(
        `Organization ${orgId} with ${userCount} users added to Redis.`
      );
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

async function measureExecutionTime(queryFunction, ...args) {
  const start = performance.now();
  const result = await queryFunction(...args);
  const end = performance.now();
  const time = end - start;
  console.log("Result:", result, time);
  return { result, time };
}

async function checkTestKV(userId, expectedOrgId) {
  const orgId = await client.get(`test_kv:${userId}`);
  return orgId === expectedOrgId;
}

async function checkTestJSON(orgId, userId) {
  const index = await client.json.arrIndex(`test_json:${orgId}`, "$", userId);
  return index !== -1;
}

async function testRedis() {
  let totalTimeKv = 0;
  let totalTimeJson = 0;

  try {
    await client.connect();
    const testsCount = process.env.TESTS_COUNT || 1000;
    for (let i = 0; i < testsCount; i++) {
      const randomUser =
        savedUsers[Math.floor(Math.random() * savedUsers.length)];
      const { userId, orgId } = randomUser;

      if (process.env.TEST_KV === "true") {

        const { time: timeKv } = await measureExecutionTime(
          checkTestKV,
          userId,
          orgId
        );
        totalTimeKv += timeKv;
      }

      if (process.env.TEST_JSON === "true") {
        const { time: timeJson } = await measureExecutionTime(
          checkTestJSON,
          orgId,
          userId
        );
        totalTimeJson += timeJson;
      }
    }

    if (process.env.TEST_KV === "true") {
      const avgTimeKv = totalTimeKv / process.env.TESTS_COUNT;
      console.log(
        `Average time for test_kv (Plain Key-Value): ${avgTimeKv.toFixed(5)} ms`
      );
    }

    if (process.env.TEST_JSON === "true") {
      const avgTimeJson = totalTimeJson / process.env.TESTS_COUNT;
      console.log(
        `Average time for test_json (ARRINDEX in JSON array): ${avgTimeJson.toFixed(5)} ms`
      );
    }

    console.log("-- Finish! --");
  } catch (err) {
    console.error("Error during Redis testing:", err);
  } finally {
    await client.disconnect();
  }
}

(async () => {
  await createData();
  await testRedis();
})();
