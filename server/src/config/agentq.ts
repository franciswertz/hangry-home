export interface AgentQConfig {
  appId: string;
  brokerUrl: string;
  username?: string;
  password?: string;
  enqueueTopic: string;
  completeTopic: string;
  qos: 0 | 1 | 2;
  statusBaseUrl?: string;
  provider: string;
  model: string;
  temperature?: number;
}

const buildTopic = (template: string, appId: string) => template.replace('{app_id}', appId);

export const loadAgentQConfig = (): AgentQConfig => {
  const appId = process.env.AGENTQ_APP_ID ?? 'hangry';
  const brokerUrl = process.env.MQTT_BROKER_URL ?? 'tcp://localhost:1883';
  const enqueueTemplate = process.env.MQTT_ENQUEUE_TOPIC ?? 'jobs/enqueue/{app_id}';
  const completeTemplate = process.env.MQTT_COMPLETE_TOPIC ?? 'jobs/complete/{app_id}';
  const qosValue = Number(process.env.MQTT_QOS ?? 1);
  const qos = (qosValue === 0 || qosValue === 2 ? qosValue : 1) as 0 | 1 | 2;
  const temperature = process.env.AGENTQ_TEMPERATURE ? Number(process.env.AGENTQ_TEMPERATURE) : undefined;

  return {
    appId,
    brokerUrl,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    enqueueTopic: buildTopic(enqueueTemplate, appId),
    completeTopic: buildTopic(completeTemplate, appId),
    qos,
    statusBaseUrl: process.env.STATUS_BASE_URL,
    provider: process.env.AGENTQ_PROVIDER ?? 'openai',
    model: process.env.AGENTQ_MODEL ?? 'gpt-5.2-codex',
    temperature,
  };
};
