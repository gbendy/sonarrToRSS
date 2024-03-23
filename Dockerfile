FROM node:20-alpine

LABEL maintainer="gbendy"

VOLUME /data
EXPOSE 18989/tcp
ENV NODE_ENV=production

RUN apk add setpriv

ARG PGID=1000
ARG PUID=1000

ENV PGID $PGID
ENV PUID $PUID

WORKDIR /opt/sonarrToRSS

COPY package.json package-lock.json docker/start ./
RUN npm install

COPY src/favicon.ico src/
COPY src/views src/views

COPY dist .

CMD [ "./start" ]
