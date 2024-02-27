FROM node:lts

RUN npm install -g @web3-storage/w3cli && \
  apt update && \
  apt install -y jq

# meant to be mounted from the docker-compose file
WORKDIR /repo

CMD ["bash", "-c", "./apps/pin-sh/uploadToW3Storage.sh"]
