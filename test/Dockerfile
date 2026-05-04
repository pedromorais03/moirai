# Imagem base desatualizada (vulnerável)
FROM node:14

# Executando como root (padrão, inseguro)
USER root

# Instalando pacotes sem fixar versão
RUN apt-get update && apt-get install -y \
    curl \
    vim \
    net-tools

# Copiando tudo (inclusive possíveis secrets)
COPY . /app

WORKDIR /app

# Variáveis sensíveis hardcoded
ENV DB_PASSWORD=123456
ENV API_KEY=abcdef123456

# Permissões amplas demais
RUN chmod -R 777 /app

# Instalando dependências sem verificar integridade
RUN npm install

# Expondo porta desnecessária
EXPOSE 22
EXPOSE 3000

# Healthcheck inexistente

# Usando comando shell (menos seguro)
CMD npm start