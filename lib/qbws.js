var http = require('http');
var soap = require('soap');
var chalk = require('chalk');
var fs = require('fs');
var builder = require('xmlbuilder');
var uuid = require('node-uuid');
var DOMParser = require('xmldom').DOMParser;

var qbws,
    server,
    counter = null,
    connectionErrCounter = null,
    username = process.env.QB_USERNAME || 'username',
    password = process.env.QB_PASSWORD || 'password',
    // Change companyFile to an empty string to use the company file
    //     currently open in Quickbooks
    companyFile = process.env.QB_COMPANY_FILE_PATH || 'C:\\Users\\Public\\Documents\\Intuit\\QuickBooks\\Sample Company Files\\QuickBooks 2014\\sample_wholesale-distribution business.qbw',
    req = [],
    config = {
        'verbosity': 2
    };


var progress = 0;
var shopifyData = [];
var line_items_index = 0;
var items_not_found = [];


const 
   PROGRESS_ERROR = -1,
   PROGRESS_START = 1,
   CUST_SEARCH = 11,
   CUST_NOTFOUND = 13,
   CUST_CREATE = 14,
   CUST_READY =15,
   ITEM_SEARCH = 20,
   ITEM_CREATE = 23,
   ITEMS_READY = 25,
   INVOICE_CREATE = 50,
   INVOICE_READY = 60,
   PAYMENT_CREATE = 80,
   PROGRESS_COMPLETED = 100;


function buildWsdl(wsdlFileLocation) {
    var wsdl,
        address = config.wsdlAddress;

    wsdlFileLocation = wsdlFileLocation || '/qbws.wsdl';
    wsdl = fs.readFileSync(__dirname + wsdlFileLocation, 'utf8');

    if (address) {
        wsdl = wsdl.replace(/<soap:address\ +location=".*"\ +\/>/,
                            '<soap:address location="' + address + '" />');
    }

    return wsdl;
}



var isJSON = (jsonData) => {
    var returnVal;
   if(typeof jsonData !== 'string') {
        returnVal =  false;
   }else {
       try {
        JSON.parse(jsonData);
            returnVal = true;
       }
       catch(err) {
            returnVal = false;
       }
    }

    return returnVal;
}

var productName = (pName) => {
    return pName.replace('- Speical Deal','')
                .replace('*', 'x')
                .replace('Acupuncture ','')
                .replace('Japanese ','')
                .replace(' 100pcs','')          //lines above are for needles
                .replace('Low- Frequency 7 Channel Tens Unit and Electrical Needles Stimulator','tens')
                .replace('Chinese Herbal Medicine: Formulas & Strategies: 2nd Portable Edition','Formula')
                .replace('Clinical Handbook of Internal Medicine: The Treatment of Disease With Traditional Chinese Medicine','Internal Medicine')
                .replace('Diagnosis in Chinese Medicine','Diagnosis')
                .replace('Handbook of Oriental Medicine 3rd','Handbook 3rd')
                .replace('Handbook of Oriental Medicine 5th','Handbook 5th')
                .replace('Integrative Pharmacology (2nd Edition Integrated Pharmacology): Combining Modern Pharmacology with Integrative Medicine','Integrative Pharmacology')
                .replace('Manual of Acupuncture Deadman','Acupuncture Deadman')
                .replace('The Foundations of Chinese Medicine: A Comprehensive Text','Foundations')     // lines above are for books
                .replace(' - Special Deal','')
                .replace('(','').replace(')','')
                .replace(/[^a-z\d\s]+/gi,'')
                .trim();
}


var buildInvoiceProcessStart = (receivedShopifyData) => {
    // This function is to filter out the transcation made by Website. In other word, the transcation made by POS will not be proceeded.
    var badData = false;
    var webVerify = JSON.parse(receivedShopifyData);
    console.log(chalk.green("##### Server: Data Received From Shopify Webhooks, start processing ... #####"));
    

    webVerify.line_items.forEach((item)=>{
        if (item.variant_id === null) {
            badData = true;
        }
    });

    if (badData == false) {
        webVerify.progress = PROGRESS_START;
        shopifyData.push(webVerify);
        console.log(chalk.green('##### Data Is Added to "shopifyData" queue !!!'));
    }
    else {
        console.log(chalk.red('##### The Order Contains Customized Item. Process Abort !!! #####'));
    }  
}



var findCustomerQuery = (receivedShopifyData) => {
    var inputXMLDoc, strRequestXML,customer;
    
    try{
        customer = receivedShopifyData.customer;

        inputXMLDoc = builder.create('QBXML', { version: '1.0' })
                  .instruction('qbxml', 'version="4.0"')
                  .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' })
                      .ele('CustomerQueryRq')
                        .ele('FullName', customer.first_name + ' ' + customer.last_name);

        strRequestXML = inputXMLDoc.end({ 'pretty': false });
    }
    catch(err) {
        console.log(chalk.red('!!!!! Customer Information is wrong !!!!!'));
        strRequestXML = '';
    }
    return strRequestXML;
}





var createCustomerQuery = (receivedShopifyData) => {
    var inputXMLDoc, strRequestXML, customer;

    try {
        customer = receivedShopifyData.customer;

        inputXMLDoc = builder.create('QBXML', { version: '1.0' })
                .instruction('qbxml', 'version="4.0"')
                .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' })
                    .ele('CustomerAddRq')
                      .ele('CustomerAdd')
                        .ele('Name', customer.first_name + ' ' + customer.last_name).up()
                        .ele('CompanyName', customer.default_address.company).up()
                        .ele('FirstName',customer.first_name).up()
                        .ele('LastName',customer.last_name).up()
                        .ele('BillAddress')
                            .ele('Addr1',customer.default_address.address1).up()
                            .ele('City',customer.default_address.city).up()
                            .ele('State',customer.default_address.province).up()
                            .ele('PostalCode',customer.default_address.zip).up()
                            .ele('Country','Canada').up().up()
                        .ele('ShipAddress')
                            .ele('Addr1',customer.default_address.address1).up()
                            .ele('City',customer.default_address.city).up()
                            .ele('State',customer.default_address.province).up()
                            .ele('PostalCode',customer.default_address.zip).up()
                            .ele('Country','Canada').up().up()
                        .ele('Phone',customer.default_address.phone).up()
                        .ele('Email',customer.email);
                            
            
        strRequestXML = inputXMLDoc.end({ 'pretty': true});
    }
    catch(err) {
        console.log(chalk.red('!!!!! Customer Information is wrong!!!!!'));
        strRequestXML = '';
    }

    return strRequestXML;
}



var findItemsQuery = (receivedShopifyDataItem) => {
    var inputXMLDoc, strRequestXML,itemName;

    itemName = productName(receivedShopifyDataItem.title);    

    inputXMLDoc = builder.create('QBXML', { version: '1.0' })
              .instruction('qbxml', 'version="4.0"')
              .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' })
                  .ele('ItemQueryRq')
                    .ele('FullName', itemName);

    strRequestXML = inputXMLDoc.end({ 'pretty': true });

    return strRequestXML; 
}





var createItemQuery = (receivedShopifyDataItem) => {
    var strRequestXML;

    try {
        strRequestXML = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="4.0"?><QBXML><QBXMLMsgsRq onError="stopOnError">';
        
        for (var i = 0 ; i < receivedShopifyDataItem.length ; i ++) {
            var tempStr = '';
            tempStr =   '<ItemInventoryAddRq requestID="'+ (i+1) + '">'
                            + '<ItemInventoryAdd>'
                                + '<Name>'+ productName(receivedShopifyDataItem[i].title) +'</Name>'
                                + '<SalesPrice>'+ receivedShopifyDataItem[i].price +'</SalesPrice>'
                                + '<IncomeAccountRef><FullName>Sales</FullName></IncomeAccountRef>'
                                + '<COGSAccountRef><FullName>Cost of Goods Sold</FullName></COGSAccountRef>'
                                + '<AssetAccountRef><FullName>Inventory Asset</FullName></AssetAccountRef>'
                            + '</ItemInventoryAdd>'
                        +'</ItemInventoryAddRq>'; 
            strRequestXML += tempStr;
        }
        strRequestXML += '</QBXMLMsgsRq></QBXML>';
    }
    catch(err) {
        console.log(chalk.red('!!!!! Item information is wrong !!!!!'));
        strRequestXML = '';
    }
    return strRequestXML;  
}





var createInvoiceQuery = (receivedShopifyData) => {
    var strRequestXML;
    var Memo = '';
    var data, tax;
    var taxType = '.'; 

    data = receivedShopifyData;

    try {
        if(data.tax_lines[0]) {
            if (data.tax_lines[0].title == 'HST'){
                if(data.tax_lines[0].rate == 0.13) {
                    taxType = 'H13';
                }else if(data.tax_lines[0].rate == 0.15) {
                    taxType = 'H15';
                } 
            }
            else if(data.tax_lines[0].title == 'GST') {
                taxType = 'GST';
            }
        }

        tax = '<SalesTaxCodeRef><FullName>' + taxType +'</FullName></SalesTaxCodeRef>';
   


        if ( data.discount_codes[0] ) {
            Memo = '<Memo>' + data.discount_codes[0].code + '</Memo>';
        }
    }
    catch(err) {
        console.log(chalk.red('!!!!! Tax or Memo information is wrong !!!!!'));
    }



    strRequestXML = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="4.0"?><QBXML><QBXMLMsgsRq onError="continueOnError"><InvoiceAddRq><InvoiceAdd>'
                        + '<CustomerRef><FullName>' + data.customer.first_name + ' ' + data.customer.last_name + '</FullName></CustomerRef>'
                        + '<TxnDate>' + data.created_at.substring(0,10) + '</TxnDate>'
                        + '<RefNumber>' + 'Web' + data.name.substring(1,5) + '</RefNumber>'
                        + Memo
                        + '<IsToBePrinted>true</IsToBePrinted>';                 


    for (var i = 0 ; i < data.line_items.length ; i ++) {
        var tempStr = '';
        tempStr =  '<InvoiceLineAdd><ItemRef><FullName>' + productName(data.line_items[i].title) + '</FullName></ItemRef>'
                    + '<Quantity>' + data.line_items[i].quantity + '</Quantity>' + tax + '</InvoiceLineAdd>';  

        strRequestXML += tempStr;
    }

    try {
        if( data.shipping_lines[0]) {
            strRequestXML += '<InvoiceLineAdd><ItemRef><FullName>Shipping Fee</FullName></ItemRef><Amount>' + data.shipping_lines[0].price + '</Amount></InvoiceLineAdd>';
        }


        if( data.total_discounts > 0 ) {
            strRequestXML += '<InvoiceLineAdd><ItemRef><FullName>Discount</FullName></ItemRef><Amount>-' + data.total_discounts + '</Amount>' + tax + '</InvoiceLineAdd>'; 
        } 
    }
    catch(err) {
        console.log(chalk.red('!!!!! shipping or discount information is wrong'));
    }

    strRequestXML += '</InvoiceAdd></InvoiceAddRq></QBXMLMsgsRq></QBXML>';
  
    return strRequestXML;
}







var createPaymentQuery = (data) => {
    var queryData = data;
    var strRequestXML,inputXMLDoc;


    var memo = '';

    if( queryData.payment_details) {
        memo += queryData.payment_details.credit_card_company + '-bin' + queryData.payment_details.credit_card_bin + '-' + queryData.payment_details.credit_card_number.substring(15,21);
    }
    
    strRequestXML = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="4.0"?><QBXML>'
                        + '<QBXMLMsgsRq onError="stopOnError">'
                            + '<ReceivePaymentAddRq>' 
                                + '<ReceivePaymentAdd>'
                                    + '<CustomerRef>'
                                        + '<FullName>' + queryData.customer.first_name + ' ' + queryData.customer.last_name + '</FullName>'
                                    + '</CustomerRef>'
                                    + '<TxnDate>' + queryData.created_at.substring(0,10) + '</TxnDate>'
                                    + '<RefNumber>' + 'Web' + queryData.number + '</RefNumber>'
                                    + '<TotalAmount>' + queryData.total_price + '</TotalAmount>'
                                    + '<PaymentMethodRef>'
                                        + '<FullName>Shopify</FullName>'
                                    + '</PaymentMethodRef>'    
                                    + '<Memo>' + memo + '</Memo>'
                                    + '<IsAutoApply>true</IsAutoApply>'
                                + '</ReceivePaymentAdd>'
                            + '</ReceivePaymentAddRq>'
                        + '</QBXMLMsgsRq>'
                    + '</QBXML>';
    
    return strRequestXML;
}

var statusOK = (queryName,response) => {

    const STATUS_OK = 'Status OK';
    var xmlParser = new DOMParser().parseFromString(response);
    var status = '';

    try {

        status = xmlParser.getElementsByTagName(queryName)[0].getAttribute('statusMessage');
    }
    catch(err) {
        console.log(chalk.red('ERROR happening in CUST_SEARCH process'));
    }

    return status == STATUS_OK;
}



var cleanDataQueue = () => {
    shopifyData.shift();
    line_items_index = 0;
    items_not_found = [];
}



function parseForVersion(input) {
    var major = '',
        minor = '',
        version = /^(\d+)\.(\d+)(\.\w+){0,2}$/,
        versionMatch;

    versionMatch = version.exec(input.toString());

    if (versionMatch !== null) {
        major = versionMatch[1];
        minor = versionMatch[2];

        return major + '.' + minor;
    } else {
        return input;
    }
}


function serviceLog(data) {
    // TODO: Put the log file somewhere else
    var consoleLogging = true;
    if (consoleLogging) {
        console.log(data);
    }

    fs.appendFile('log.log', chalk.stripColor(data) + '\n', function callback(err) {
        if (err) {
            console.log(err);
        }
    });
}



function objectNotEmpty(obj) {
    if (typeof obj !== 'object') {
        return null;
    }

    return Object.getOwnPropertyNames(obj).length;
}



function announceMethod(name, params) {
    var arg,
        argType;

    if (config.verbosity > 0) {
        serviceLog(chalk.green('WebMethod: ' + name +
                    '() has been called by QBWebConnector'));
    }

    if (config.verbosity > 1) {
        if (objectNotEmpty(params)) {
            serviceLog('    Parameters received:');
            for (arg in params) {
                if (params.hasOwnProperty(arg)) {
                    // TODO: Truncate long value
                    argType = typeof params[arg];
                    // TODO: DRY this up
                    if (argType === 'object') {
                        serviceLog('        ' + argType + ' ' + arg + ' = ' +
                                   JSON.stringify(params[arg], null, 2));
                    } else {
                        serviceLog('        ' + argType + ' ' + arg + ' = ' +
                                   params[arg]);
                    }
                }
            }
        } else {
            serviceLog('    No parameters received.');
        }
    }
}

qbws = {
    QBWebConnectorSvc: {
        QBWebConnectorSvcSoap: {}
    }
};


qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.authenticate =
function (args) {
    var authReturn = [];

    announceMethod('authenticate', args);

    // Code below uses a random GUID to use as a session ticket
    // An example of a GUID is {85B41BEE-5CD9-427a-A61B-83964F1EB426}
    authReturn[0] = uuid.v1();

    // For simplicity of sample, a hardcoded username/password is used.
    // In real world, you should handle authentication in using a standard way.
    // For example, you could validate the username/password against an LDAP
    // or a directory server
    // TODO: This shouldn't be hard coded
    serviceLog('    Password locally stored = ' + password);

    if (args.strUserName.trim() === username && args.strPassword.trim() === password) {
        //req = buildRequest();
        req = 'req';
        if (req.length === 0) {
            authReturn[1] = 'NONE';
        } else {
            // An empty string for authReturn[1] means asking QBWebConnector
            // to connect to the company file that is currently opened in QB
            authReturn[1] = companyFile;
        }
    } else {
        authReturn[1] = 'nvu';
    }

    serviceLog('    Return values: ');
    serviceLog('        string[] authReturn[0] = ' + authReturn[0]);
    serviceLog('        string[] authReturn[1] = ' + authReturn[1]);

    return {
        authenticateResult: { 'string': [authReturn[0], authReturn[1]] }
    };
};


qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.clientVersion =
function (args) {
    var strVersion = args.strVersion,
        recommendedVersion = '2.0.1.30',
        supportedMinVersion = '1.0',
        suppliedVersion,
        retVal = '';

    suppliedVersion = parseForVersion(strVersion);

    announceMethod('clientVersion', args);

    serviceLog('    QBWebConnector Version = ' + strVersion);
    serviceLog('    Recommended Version = ' + recommendedVersion);
    serviceLog('    Supported Minimum Version = ' + supportedMinVersion);
    serviceLog('    Supplied Version = ' + suppliedVersion);

    if (strVersion < recommendedVersion) {
        retVal = 'W:We recommend that you upgrade your QBWebConnector';
    } else if (strVersion < supportedMinVersion) {
        retVal = 'E:You need to upgrade your QBWebConnector';
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        clientVersionResult: { 'string': retVal }
    };
};



qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.closeConnection =
function (args) {
    var retVal = null;

    announceMethod('closeConnection', args);

    // This method doesn't currently do anything very interesting, just returns
    //   an 'OK' message.
    retVal = 'OK';

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        closeConnectionResult: { 'string': retVal }
    };
};


qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.connectionError =
function (args) {
    var hresult = args.hresult,
        message = args.message,
        retVal = null,
    // 0x80040400 - QuickBooks found an error when parsing the
    //     provided XML text stream.
        QB_ERROR_WHEN_PARSING = '0x80040400',
    // 0x80040401 - Could not access QuickBooks.
        QB_COULDNT_ACCESS_QB = '0x80040401',
    // 0x80040402 - Unexpected error. Check the qbsdklog.txt file for
    //     possible additional information.
        QB_UNEXPECTED_ERROR = '0x80040402';
    // Add more as you need...

    if (connectionErrCounter === null) {
        connectionErrCounter = 0;
    }

    announceMethod('connectionError', args);

    // TODO: Why is the same code repeated thrice? Switch statement instead?
    if (hresult.trim() === QB_ERROR_WHEN_PARSING) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else if (hresult.trim() === QB_COULDNT_ACCESS_QB) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else if (hresult.trim() === QB_UNEXPECTED_ERROR) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else {
        // Depending on various hresults return different value
        if (connectionErrCounter === 0) {
            // Try again with this company file
            serviceLog('    HRESULT = ' + hresult);
            serviceLog('    Message = ' + message);
            serviceLog('    Sending empty company file to try again.');
            retVal = '';
        } else {
            serviceLog('    HRESULT = ' + hresult);
            serviceLog('    Message = ' + message);
            serviceLog('    Sending DONE to stop.');
            //retVal = 'DONE';
            retVal = '';
        }
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);
    connectionErrCounter = connectionErrCounter + 1;

    return {
        connectionErrorResult: { 'string': retVal }
    };
};


qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.getInteractiveURL =
function (args) {
    var retVal = '';

    announceMethod('getInteractiveURL', args);

    return {
        getInteractiveURLResult: { 'string': retVal }
    };
};



qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.getLastError =
function (args) {
    var errorCode = 0,
        retVal = '';

    announceMethod('getLastError', args);

    if (errorCode === -101) {
        // This is just an example of custom user errors
        retVal = 'QuickBooks was not running!';
    } else {
        retVal = 'Error!';
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        getLastErrorResult:  { 'string': retVal }
    };
};


qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.interactiveDone =
function (args) {
    var retVal = '';

    announceMethod('interactiveDone', args);

    return {
        interactiveDoneResult: { 'string': retVal }
    };
};



qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.interactiveRejected =
function (args) {
    var retVal = '';

    announceMethod('interactiveRejected', args);

    return {
        interactiveRejectedResult: { 'string': retVal }
    };
};



qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.sendRequestXML =
function (args) {
    var query = '';  //if query is empty string. then there nothing to send;
    var queryData;
    //announceMethod('sendResponseXML', args);


    // console.log(chalk.red(JSON.stringify(shopifyData)));

    if (shopifyData.length > 0) {
        queryData = shopifyData[0];

        console.log(chalk.green('@@@@@ In sendRequest @@@@@ ' + shopifyData.length + ' jobs to do, current progress is: ' + queryData.progress));

        if ( queryData.progress == PROGRESS_START ) {
            query = findCustomerQuery(queryData);
            queryData.progress = CUST_SEARCH;
            console.log(chalk.blue('##### S: Customer Search Query ##### ' + 'progress now is: ' + queryData.progress));
        }
        
        else if ( queryData.progress == CUST_NOTFOUND ) {
            query = createCustomerQuery(queryData);
            queryData.progress = CUST_CREATE;
            console.log(chalk.blue('##### S: Customer Create Query ##### ' + 'progress now is: ' + queryData.progress));
        }
        
        else if ( queryData.progress == CUST_READY) {
            if ( line_items_index != queryData.line_items.length ) {
                query = findItemsQuery(queryData.line_items[line_items_index]);
                console.log(chalk.blue('##### S: '+ (line_items_index + 1) + '/' + queryData.line_items.length + 'Item Search Query #####' + 'progress now is ' + queryData.progress));
            }
            else if (line_items_index == queryData.line_items.length && items_not_found){
                query = createItemQuery(items_not_found);
                queryData.progress = ITEM_CREATE;
                console.log(chalk.blue('##### S: Items Create Query #####' + 'progress now is: ' + queryData.progress));
            }
        }

        else if ( queryData.progress == ITEMS_READY) {
            queryData.progress = INVOICE_CREATE;
            console.log(chalk.blue('##### S: Creating Invoice #####' + 'progress now is: ' + queryData.progress));
            query = createInvoiceQuery(queryData);
        }

        else if ( queryData.progress == INVOICE_READY) {
                queryData.progress = PAYMENT_CREATE;
                console.log(chalk.blue('##### S: Creating Payment #####' + 'progress now is: ' + queryData.progress));
                query = createPaymentQuery(queryData);   
        }
        else if( queryData.progress == PROGRESS_COMPLETED) {
            console.log(chalk.blue('##### S: Order process have completed #####' + 'progress now is: ' + queryData.progress));
        }

        else {
            console.log(chlk.red('wrong'));
        }
    } 
    else {
        console.log(chalk.red('##### No more job to do #####'));
        query = '';
    }



    return {
        sendRequestXMLResult: { 'string': query }
    };
};



/**
 *   Possible values:
 *   - Greater than 0 - There are more requests to send
 *   - 100 - Done; no more requests to send
 *   - Less than 0 - Custom error codes
 */


qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.receiveResponseXML =
function (args) {
    //announceMethod('receiveResponseXML', args);

    var status = '';

     if (shopifyData.length > 0 && shopifyData[0].progress > 0) {
        queryData = shopifyData[0];   

        console.log(chalk.green('@@@@@ In receiveRequest @@@@@ current progress is: ' + queryData.progress));
        
        if (queryData.progress == 0 ) {
            console.log('##### R: Nothing to do #####');
        }


        else if ( queryData.progress == CUST_SEARCH) {

            if(statusOK('CustomerQueryRs',args.response)){
                queryData.progress = CUST_READY;
                console.log(chalk.blue('##### R: Customer is in QuickBooks ##### - Progress is now : ' + queryData.progress));    
            }
            else {
                queryData.progress = CUST_NOTFOUND;
                console.log(chalk.red('##### R: Customer is NOT in QuickBooks ##### - Progress is now : ' + queryData.progress));        
            }
        }


        else if( queryData.progress == CUST_CREATE){

            if(statusOK('CustomerAddRs',args.response)) {
                queryData.progress = CUST_READY;
                console.log(chalk.blue('##### R: Customer is created ##### - Progress is now: ' + queryData.progress ));
            }
            else {
                queryData.progress = PROGRESS_ERROR;
                console.log(chalk.blue('##### R: Something is wrong, customer is not created.  Abort process #####'));
                cleanDataQueue();            
            }
        }
       

        else if( queryData.progress == CUST_READY) {

            if(statusOK('ItemQueryRs',args.response)){
                console.log(chalk.blue('##### R: Item is found ##### - ' + 'Progress is now: ' + queryData.progress + ' line_items_index: ' + (line_items_index + 1)));    

            }
            else {
                console.log(chalk.red('##### R: Item is not found #####' + 'Progress is now: ' + queryData.progress));
                items_not_found.push(shopifyData[0].line_items[line_items_index]);
            }
                line_items_index++;
        }


        else if (queryData.progress == ITEM_CREATE) {
            queryData.progress = ITEMS_READY;
            console.log(chalk.blue('##### R: Item array items_not_found have been created into Quickbooks ##### - Porgress is now: ' + queryData.progress));
        }

        
        else if (queryData.progress == INVOICE_CREATE) {
           
            if( statusOK('InvoiceAddRs',args.response)) {
                queryData.progress = INVOICE_READY;
                console.log(chalk.blue('##### R: Invoice is successfully created #####' + 'Progress is now: ' + queryData.progress));
            }
            else {
                queryData.progress = PROGRESS_ERROR;
                console.log(chalk.red('##### R: Something went wrong, Invoice is not created. Abort process #####'));
                cleanDataQueue();  
            }
        }


        else if (queryData.progress == PAYMENT_CREATE) {
            if(statusOK('ReceivePaymentAddRs',args.response)) {
                queryData.progress = PROGRESS_COMPLETED;
                console.log(chalk.blue('##### R: Payment has been created #####' + 'Progress is now: ' + queryData.progress));
                cleanDataQueue();
            }

            else {
                queryData.progress = PROGRESS_ERROR;
                console.log(chalk.red('##### R: Something went wrong, Payment is not created. Abort process #####'));
                cleanDataQueue();  
            }

        }
    
    }
 
    return {
        receiveResponseXMLResult: { 'int': queryData.progress }
    };

};


qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.serverVersion =
function (args) {
    var retVal = '0.2.1';

    announceMethod('serverVersion', args);
    serviceLog('    No parameters required.');
    serviceLog('    Returned: ' + retVal);

    return {
        serverVersionResult: { 'string': retVal }
    };
};

server = http.createServer(function requestListener(request,response) {
    response.end('404: Not Found: ' + request.url);
});

module.exports.run = function runQBWS() {
    var soapServer,
        xml = fs.readFileSync(__dirname + '/qbws.wsdl', 'utf8');

    server.listen(8000);
    soapServer = soap.listen(server, '/wsdl', qbws, xml);
    console.log(chalk.yellow("Listening At Port: 8000"));

    soapServer.log = function soapServerLog(type, data) {
        if(type == 'received' && isJSON(data)) {
            console.log(chalk.yellow(data));
            buildInvoiceProcessStart(data);
        }
    };
};



