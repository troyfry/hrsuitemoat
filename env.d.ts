// env.d.ts
declare namespace NodeJS {
    interface ProcessEnv {
      OPENAI_API_KEY: string;
      OPENAI_QA_MODEL?: string;
      OPENAI_REVIEW_MODEL?: string;
      HR_TRUSTED_DOMAINS?: string;
    }
  }
  