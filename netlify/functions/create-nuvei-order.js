const fetch = require("node-fetch");
const CryptoJS = require("crypto-js");

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Allow": "POST" },
      body: "Método no permitido"
    };
  }

  try {
    const { amount, currency } = JSON.parse(event.body);

    // Variables de entorno (configuradas en Netlify)
    const merchantId = process.env.NUVEI_MERCHANT_ID;
    const merchantSiteId = process.env.NUVEI_MERCHANT_SITE_ID;
    const merchantSecretKey = process.env.NUVEI_MERCHANT_SECRET_KEY;

    // 1️⃣ Generar timestamp y clientRequestId
    const fecha = new Date();
    const timestamp = `${fecha.getFullYear()}${padZero(fecha.getMonth() + 1)}${padZero(fecha.getDate())}${padZero(fecha.getHours())}${padZero(fecha.getMinutes())}${padZero(fecha.getSeconds())}`;
    const clientRequestId = timestamp; // puedes usar otro generador si prefieres

    function padZero(valor) {
      return valor.toString().padStart(2, "0");
    }

    // 2️⃣ Generar checksum
    const cadena = CryptoJS.SHA256(
      merchantId + merchantSiteId + clientRequestId + timestamp + merchantSecretKey
    );
    const checksum = cadena.toString();

    // 3️⃣ Llamar a getSessionToken.do
    const tokenResp = await fetch("https://ppp-test.nuvei.com/ppp/api/v1/getSessionToken.do", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantId,
        merchantSiteId,
        clientRequestId,
        timeStamp: timestamp,
        checksum
      })
    });

    const tokenData = await tokenResp.json();

    if (!tokenData.sessionToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No se pudo obtener sessionToken", data: tokenData })
      };
    }

    const sessionToken = tokenData.sessionToken;

    // 4️⃣ Llamar a payment.do con el sessionToken
    const paymentResp = await fetch("https://ppp-test.safecharge.com/ppp/api/payment.do", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantId,
        merchantSiteId,
        clientRequestId,
        currency: currency || "USD",
        amount: amount || 100,
        sessionToken,
        paymentOption: {
          alternativePaymentMethod: { method: "PayPal" }
        }
      })
    });

    const paymentData = await paymentResp.json();

    if (paymentData.status !== "SUCCESS") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Error en payment.do", data: paymentData })
      };
    }

    // 5️⃣ Extraer transactionBankId del redirectUrl
    const transactionBankId = paymentData.paymentOption.redirectUrl.match(/orderId=([^;]+)/)[1];

    return {
      statusCode: 200,
      body: JSON.stringify({ transactionBankId })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
