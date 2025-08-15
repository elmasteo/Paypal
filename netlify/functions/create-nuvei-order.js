const fetch = require("node-fetch");
const CryptoJS = require("crypto-js");
const { randomUUID } = require("crypto");

module.exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "POST" },
      body: "Método no permitido",
    };
  }

  try {
    const { amount, currency } = JSON.parse(event.body);

    // Variables de entorno
    const merchantId = process.env.NUVEI_MERCHANT_ID;
    const merchantSiteId = process.env.NUVEI_MERCHANT_SITE_ID;
    const merchantSecretKey = process.env.NUVEI_MERCHANT_SECRET_KEY;

    function padZero(v) {
      return v.toString().padStart(2, "0");
    }

    const fecha = new Date();
    const timestamp = `${fecha.getFullYear()}${padZero(
      fecha.getMonth() + 1
    )}${padZero(fecha.getDate())}${padZero(fecha.getHours())}${padZero(
      fecha.getMinutes()
    )}${padZero(fecha.getSeconds())}`;
    const clientRequestId = timestamp;

    // 1️⃣ Obtener sessionToken
    const checksumSession = CryptoJS.SHA256(
      merchantId + merchantSiteId + clientRequestId + timestamp + merchantSecretKey
    ).toString();

    const tokenResp = await fetch(
      "https://ppp-test.nuvei.com/ppp/api/v1/getSessionToken.do",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId,
          merchantSiteId,
          clientRequestId,
          timeStamp: timestamp,
          checksum: checksumSession,
        }),
      }
    );

    const tokenData = await tokenResp.json();
    if (!tokenData.sessionToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No se pudo obtener sessionToken",
          data: tokenData,
        }),
      };
    }

    const sessionToken = tokenData.sessionToken;

    // 2️⃣ Generar userTokenId único
    const userTokenId = randomUUID();

    // 3️⃣ Crear checksum para payment.do (debe incluir userTokenId según docs)
    const checksumPayment = CryptoJS.SHA256(
      merchantId +
        merchantSiteId +
        clientRequestId +
        amount.toString() +
        currency +
        userTokenId +
        timestamp +
        merchantSecretKey
    ).toString();

    // 4️⃣ Llamada a payment.do
    const paymentResp = await fetch(
      "https://ppp-test.safecharge.com/ppp/api/payment.do",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          merchantId,
          merchantSiteId,
          clientRequestId,
          amount,
          currency,
          userTokenId,
          clientUniqueId: `unique_${Date.now()}`,
          paymentOption: {
            alternativePaymentMethod: { paymentMethod: "apmgw_expresscheckout" },
          },
          deviceDetails: { ipAddress: "10.2.57.122" },
          billingAddress: {
            firstName: "John",
            lastName: "Smith",
            email: "SCTest2@gmail.com",
            country: "US",
          },
          userDetails: {
            firstName: "John",
            lastName: "Smith",
            email: "SCTest2@gmail.com",
            country: "US",
          },
          timeStamp: timestamp,
          checksum: checksumPayment,
        }),
      }
    );

    const paymentData = await paymentResp.json();

    if (paymentData.status !== "SUCCESS") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Error en payment.do",
          data: paymentData,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        redirectUrl: paymentData.paymentOption?.redirectUrl || null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
