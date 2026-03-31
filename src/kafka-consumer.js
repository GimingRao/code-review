import { Kafka } from "kafkajs";
import { logger } from "./logger.js";

export async function startConsumer(config, onEvent) {
  const kafka = new Kafka({
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
    ssl: config.kafka.ssl,
    sasl: config.kafka.sasl,
  });

  const consumer = kafka.consumer({
    groupId: config.kafka.groupId,
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: config.kafka.topic,
    fromBeginning: false,
  });

  logger.info("kafka consumer connected", {
    brokers: config.kafka.brokers,
    topic: config.kafka.topic,
    groupId: config.kafka.groupId,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString("utf8") || "";
      if (!raw) {
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        logger.error("invalid kafka message", {
          topic,
          partition,
          offset: message.offset,
          error: error.message,
        });
        return;
      }

      if (parsed.event !== "git.commit") {
        return;
      }

      await onEvent(parsed, {
        topic,
        partition,
        offset: message.offset,
      });
    },
  });

  return consumer;
}
