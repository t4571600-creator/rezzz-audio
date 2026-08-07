FROM python:3.11-slim

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip install -U yt-dlp

WORKDIR /app

COPY package.json .
RUN npm install

COPY server.js .

EXPOSE 3000

CMD ["node", "server.js"]
