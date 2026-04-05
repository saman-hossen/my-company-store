const nm = require('nodemailer');
nm.createTransport({
    service: 'gmail',
    auth: {
        user: 'samanhossen12@gmail.com',
        pass: 'tnpbypllfueyubjx'
    }
}).sendMail({
    from: 'samanhossen12@gmail.com',
    to: 'samanhossen12@gmail.com',
    subject: 'Test',
    text: '123'
}, (e, i) => console.log(e ? 'ERR: ' + e : 'OK: ' + i.response));