FROM node:18-alpine

# Install curl for the healthcheck
RUN apk add --no-cache curl

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 7000

# Docker will mark the container as unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:7000/health || exit 1

CMD ["node", "addon.js"]