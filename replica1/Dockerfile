FROM node:18

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Use nodemon for hot-reload
CMD ["npm", "run", "dev"]
