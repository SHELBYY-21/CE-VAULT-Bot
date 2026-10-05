# CE VAULT production runtime wrapper
FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# The root package is a lightweight bootstrap wrapper. The build script
# reconstructs appsrc, installs its dependencies, validates it, and leaves
# appsrc ready for the runtime start script.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
