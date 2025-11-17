FROM node:18-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy root configs needed for TypeScript references
COPY package*.json tsconfig.base.json ./

# Copy application sources
COPY api ./api
COPY fixtures ./fixtures

WORKDIR /app/api

RUN npm install && npm run build

EXPOSE 4000
CMD ["sh", "-c", "npm run migrate && npm run seed && npm run start"]

