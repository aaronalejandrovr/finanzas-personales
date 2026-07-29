const FormData = require('form-data');

async function testSubmit() {
    const form = new FormData();
    form.append('type', 'egreso');
    form.append('date', '2023-01-01');
    form.append('description', 'Test Egreso');
    form.append('priority', 'no_prioritario');
    form.append('amount', '100');
    form.append('billetera_origen_id', '2'); // Simulate selecting wallet ID 2

    const res = await fetch('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: form
    });
    const text = await res.text();
    console.log(text);
}
testSubmit();
