import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

const schema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().port().default(8080),
  JWT_SECRET: Joi.string().min(16).default("dev-insecure-secret-change-me-0001"),
  JWT_EXPIRES_IN: Joi.string().default("12h"),

  FIREBASE_TYPE: Joi.string().allow("").optional(),
  FIREBASE_PROJECT_ID: Joi.string().allow("").optional(),
  FIREBASE_PRIVATE_KEY_ID: Joi.string().allow("").optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().allow("").optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().allow("").optional(),
  FIREBASE_CLIENT_ID: Joi.string().allow("").optional(),
  FIREBASE_DATABASE_URL: Joi.string().allow("").optional(),

  PAGERDUTY_WEBHOOK_URL: Joi.string().allow("").optional(),
  SLACK_WEBHOOK_URL: Joi.string().allow("").optional(),

  TALKSASA_API_TOKEN: Joi.string().allow("").optional(),
  TALKSASA_SENDER_ID: Joi.string().allow("").optional(),
  TALKSASA_BASE_URL: Joi.string().allow("").optional(),

  EMULATOR_MODE: Joi.boolean().truthy("true").falsy("false").default(true),

  DEMURRAGE_RATE_PER_HOUR_KES: Joi.number().min(0).default(12000),
  YARD_OPERATING_HOURS_PER_DAY: Joi.number().min(1).max(24).default(24),
  OPTIMAL_TURNAROUND_HOURS: Joi.number().min(0.1).default(4.5),

  SIM_MINUTES_PER_LOOP: Joi.number().min(0).default(300),
  SIMULATE_PUMP_FLOW: Joi.boolean().truthy("true").falsy("false").default(true),
  PRE_MOVEMENT_ALERT_MINUTES: Joi.number().min(0).default(5),
  CO2_IDLE_KG_PER_HOUR: Joi.number().min(0).default(2.68),
  CO2_TREES_PER_KG: Joi.number().min(0).default(21.7),

  CORS_ORIGIN: Joi.string().default("*"),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX: Joi.number().default(120),
}).unknown();

const { value: env, error } = schema.validate(process.env, { abortEarly: false });

if (error) {
  throw new Error(`[env] Invalid environment configuration: ${error.message}`);
}

export default {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    databaseURL: env.FIREBASE_DATABASE_URL,
    emulatorMode: env.EMULATOR_MODE,
  },
  alerts: {
    pagerDutyUrl: env.PAGERDUTY_WEBHOOK_URL,
    slackUrl: env.SLACK_WEBHOOK_URL,
  },
  sms: {
    token: env.TALKSASA_API_TOKEN,
    senderId: env.TALKSASA_SENDER_ID,
    baseUrl: env.TALKSASA_BASE_URL,
  },
  demurrageRatePerHourKes: env.DEMURRAGE_RATE_PER_HOUR_KES,
  yardOperatingHoursPerDay: env.YARD_OPERATING_HOURS_PER_DAY,
  optimalTurnaroundHours: env.OPTIMAL_TURNAROUND_HOURS,
  simMinutesPerLoop: env.SIM_MINUTES_PER_LOOP,
  simulatePumpFlow: env.SIMULATE_PUMP_FLOW,
  preMovementAlertMinutes: env.PRE_MOVEMENT_ALERT_MINUTES,
  co2: {
    idleKgPerHour: env.CO2_IDLE_KG_PER_HOUR,
    treesPerKg: env.CO2_TREES_PER_KG,
  },
  corsOrigin: env.CORS_ORIGIN,
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX,
  },
};