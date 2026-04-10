# 1. Usar una imagen oficial de Node.js (la versión alpine es más ligera)
FROM node:24-alpine

# 2. Crear y establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiar solo los archivos de dependencias primero (Buena práctica de caché)
COPY package*.json ./

# 4. Instalar las dependencias dentro del contenedor
RUN npm install

# 5. Copiar el resto del código de tu computadora al contenedor
COPY . .

# 6. Indicar el comando para encender la aplicación
CMD ["npm", "start"]