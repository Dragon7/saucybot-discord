# Build Step -- Build out our TypeScript code
FROM node:alpine AS build

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./
COPY tsconfig.json ./
COPY ./src ./src

# Install depdency packages
# git - pulling git repos
# yarn - nodejs package manager
RUN apk add --no-cache --update \
    git \
    yarn

RUN yarn install --frozen-lockfile --silent
RUN yarn build

# Production Step -- Run our compiled TypeScript code
FROM node:alpine AS production

WORKDIR /bot
ENV NODE_ENV=production

# Install depdency packages
# libc6-compat - makes sure all node functions work correctly
# ffmpeg - used for pixiv ugoira
# git - pulling git repos
# yarn - nodejs package manager
RUN apk add --no-cache --update \
    libc6-compat \
    ffmpeg \
    git \
    yarn

# Install pm2 runtime
RUN yarn global add pm2

COPY package.json ./
COPY yarn.lock ./
RUN yarn install --frozen-lockfile --silent --production
COPY --from=build /usr/src/app/dist ./dist

CMD ["pm2-runtime", "/bot/dist/src/index.js"]
