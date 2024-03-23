FROM node:20-alpine

VOLUME /data
EXPOSE 18989
ENV NODE_ENV=production

WORKDIR /opt/sonarrToRSS

COPY package.json package-lock.json .
RUN npm install

COPY src/favicon.ico src/
COPY src/views src/views

COPY dist .

CMD [ "node", "index.js", "/data/config.json" ]