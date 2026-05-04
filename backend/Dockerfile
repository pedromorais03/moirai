# backend/Dockerfile
FROM node:20-alpine AS base

# Install Trivy
RUN apk add --no-cache git curl bash \
  && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
     | sh -s -- -b /usr/local/bin

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "src/server.js"]