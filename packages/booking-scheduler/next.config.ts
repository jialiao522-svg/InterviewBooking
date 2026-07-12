import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Confirmation emails are rendered from templates/*.txt via fs.readFileSync
  // at request time; Next's file tracing doesn't detect that non-import
  // access, so the templates dir must be included explicitly for deployment.
  outputFileTracingIncludes: {
    "/api/book/[candidateId]": ["./templates/**/*"],
  },
};

export default nextConfig;
