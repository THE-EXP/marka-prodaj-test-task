const express = require('express');
const app = express();
require('dotenv').config('./');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
app.set(express.urlencoded({extended: true}));
app.use(express.json());
// Modules & definitions

const mainPort = process.env.MAIN_PORT || 80; // get app port from the config, otherwise use the default 80

async function tokens() { //* a hurrendous way to get/store access & refresh tokens, yes it works, no i will not touch it again unless required, also: hello log spam
    var tokens = '';
    var file = await fs.open(path.join(__dirname, '/tokens.cfg'), 'r+'); // open the tokens file
    var storedTokens = (await file.readFile()).toString(); // read the file and format it appropriately
    console.log(`Checking for tokens in ./token.cfg`);
    if (storedTokens == "" || storedTokens == null) { // check if it's null, authorize if needed
        console.log(`No tokens stored, authorising...`);
        tokens = await get_access_token(process.env.CRM_AUTH_CODE, file);
        console.log(`Stored, good to go`);
    } else {
        tokens = storedTokens; // if not null, use tokens from file
        console.log(`Stored tokens found, using stored tokens`)
    }
    file.close(); // close the file
    return tokens;
}

app.get('/', (req, res) => {contacts(req, res);});

app.listen(mainPort, ()=>{console.log("Server started on port:", mainPort);}); //start the server on <mainPort>


async function get_access_token(code, file) {
    response = await axios.request({
        method: 'POST',
        url: 'https://theexp.amocrm.ru/oauth2/access_token',
        data: {
            "client_id": process.env.CRM_INTEGRATION_ID,
            "client_secret": process.env.CRM_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "https://seasnail-vast-monitor.ngrok-free.app"
            }
    });
    ret = {access_token: response.data.access_token, refresh_token: response.data.refresh_token, expires_in: response.data.expires_in * 10, obtained_at: Date.now()};
    console.log(`Authorised, storing data`);
    file.writeFile(JSON.stringify(ret));
    return ret;
}

async function refresh_tokens(token) {
    console.log(`Refreshing access token...`);
    var file = await fs.open(path.join(__dirname, '/tokens.cfg'), 'r+');
    response = await axios.request({
        method: 'POST',
        url: 'https://theexp.amocrm.ru/oauth2/access_token',
        data: {
            "client_id": process.env.CRM_INTEGRATION_ID,
            "client_secret": process.env.CRM_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": token.refresh_token,
            "redirect_uri": "https://seasnail-vast-monitor.ngrok-free.app"
            }
    });
    ret = {access_token: response.data.access_token, refresh_token: response.data.refresh_token, expires_in: response.data.expires_in * 10, obtained_at: Date.now()};
    file.writeFile(JSON.stringify(ret));
    file.close();
    return ret;
}

async function contacts(req, res) { //* this function is hell, i probably should split it up
    var params = req.query;
    var all_tokens = JSON.parse(await tokens());
    if (params.name == null){
        res.status(400).json({status: 400, msg: `Required field name is missing`});
    } else if (params.email == null) {
        res.status(400).json({status: 400, msg: `Required field email is missing`});
    } else if(params.phone == null) {
        res.status(400).json({status: 400, msg: `Required field phone is missing`});
    } else if (params.name != null && params.phone != null && params.email != null){
        if ((all_tokens.obtained_at + all_tokens.expires_in) <= Date.now()){
            all_tokens = await refresh_tokens(all_tokens);
        }
        var data = (await axios.request({
            method: 'GET',
            url: 'https://theexp.amocrm.ru/api/v4/contacts',
            headers: {Authorization: `Bearer ${all_tokens.access_token}`},
            params: {
                query: params.phone
                }
        })).data;
        if (data == '') {
            data = (await axios.request({
                method: 'GET',
                url: 'https://theexp.amocrm.ru/api/v4/contacts',
                headers: {Authorization: `Bearer ${all_tokens.access_token}`},
                params: {
                    query: params.name
                    }
            })).data;
        }
        if (data == '') {
            data = (await axios.request({
                method: 'GET',
                url: 'https://theexp.amocrm.ru/api/v4/contacts',
                headers: {Authorization: `Bearer ${all_tokens.access_token}`},
                params: {
                    query: params.email
                    }
            })).data;
        }
        if (data == '') {
            data = (await axios.request({
                method: 'POST',
                url: 'https://theexp.amocrm.ru/api/v4/contacts',
                headers: {Authorization: `Bearer ${all_tokens.access_token}`},
                data: {
                    name: params.name,
                    first_name: params.name.split(' ')[1],
                    last_name: params.name.split(' ')[0],
                    custom_fields_values: [
                        {
                            field_name: "Телефон",
                            field_code: "PHONE",
                            field_type: "multitext",
                            values: [
                                {
                                    value: params.phone,
                                    enum_code: "WORK"
                                }
                            ]
                        },
                        {
                            field_name: "Email",
                            field_code: "EMAIL",
                            field_type: "multitext",
                            values: [
                                {
                                    value: params.email,
                                    enum_code: "WORK"
                                }
                            ]
                        }
                    ]
                    }
            })).data;
        } else {
            console.log(data);
            axios.request({
                method: 'PATCH',
                url: `https://theexp.amocrm.ru/api/v4/contacts/${data._embedded.contacts[0].id}`,
                headers: {Authorization: `Bearer ${all_tokens.access_token}`},
                data: {
                    first_name: params.name.split(' ')[1],
                    last_name: params.name.split(' ')[0],
                    custom_fields_values: [
                        {
                            field_name: "Телефон",
                            field_id: data._embedded.contacts[0].custom_fields_values[0].field_id,
                            field_type: "multitext",
                            values: [
                                {
                                    value: params.phone,
                                    enum_code: "WORK"
                                }
                            ]
                        },
                        {
                            field_name: "Email",
                            field_id: data._embedded.contacts[0].custom_fields_values[1].field_id,
                            field_type: "multitext",
                            values: [
                                {
                                    value: params.email,
                                    enum_code: "WORK"
                                }
                            ]
                        }
                    ]
                    }
            });
        }
        lead = (await axios.request({
            method: 'POST',
            url: 'https://theexp.amocrm.ru/api/v4/leads/complex',
            headers: {Authorization: `Bearer ${all_tokens.access_token}`},
            data: 
                [{
                    "_embedded": {
                        "contacts": [{
                            "id": data._embedded.contacts[0].id
                        }]
                    }
                }]
            
        })).data;
        res.json({code: 200, msg: `Сделка успешно создана`, lead_id: lead[0].id})
    } else {
        res.json({code: 400, msg: `Отсутствует один или более параметров`})
    }
    console.log(`Finished running the function!`)
}