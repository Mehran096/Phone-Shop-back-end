const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  const { data, error } = await resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    console.log('Resend error:', error);
    throw new Error(error.message);
  }
  
  console.log('Message sent: %s', data.id);
};

module.exports = sendEmail;




// const nodemailer = require('nodemailer')

// const sendEmail = async (options) => {
//   const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: Number(process.env.SMTP_PORT), // Make sure it's a number, not string
//     secure: false, 
//     requireTLS: true,
//     auth: {
//       user: process.env.SMTP_EMAIL,
//       pass: process.env.SMTP_PASSWORD,
//     },
//     tls: {
//       ciphers: 'SSLv3',
//       rejectUnauthorized: false
//     }
//   });

//   const message = {
//     from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
//     to: options.email,
//     subject: options.subject,
//     html: options.html,
//   }

//   const info = await transporter.sendMail(message)
//   console.log('Message sent: %s', info.messageId)
// }

// module.exports = sendEmail








// const nodemailer = require('nodemailer')

// const sendEmail = async (options) => {
//   const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: process.env.SMTP_PORT,
//     secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
//     auth: {
//       user: process.env.SMTP_EMAIL,
//       pass: process.env.SMTP_PASSWORD,
//     },
//   })

//   const message = {
//     from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
//     to: options.email,
//     subject: options.subject,
//     html: options.html,
//   }

//   const info = await transporter.sendMail(message)
//   console.log('Message sent: %s', info.messageId)
// }

// module.exports = sendEmail