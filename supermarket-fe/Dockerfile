FROM node:20-alpine

WORKDIR /app

# Cài Expo CLI
RUN npm install -g expo-cli@latest

# Copy package files
COPY package.json package-lock.json ./

# Cài dependencies
RUN npm ci

# Copy toàn bộ source
COPY . .

# Expose Expo dev server port
EXPOSE 8081

# Chạy Expo dev server
CMD ["npx", "expo", "start", "--web", "--host", "lan"]
