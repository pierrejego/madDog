// Declare url for api and wps Maddog 
const url = "https://portail.indigeo.fr"

// Create config
const config = [{
    url: url + "/maddogapi/measure_type",
    idField: "id_measure_type",
    field: "type_measure",
    idSelect: "measureType"
},
{
    url: url + "/maddogapi/site",
    idField: "id_site",
    field: "code_site",
    textfield: "name_site",
    idSelect: "codeSite"
},
{
    url: url + "/maddogapi/operator",
    idField: "id_operator",
    field: "type_operator",
    idSelect: "idOperator"
},
{
    url: url + "/maddogapi/equipment",
    idField: "id_equipment",
    field: "name_equipment",
    idSelect: "idEquipement"
}
]

// Function to filter Json by value
function find_in_object(object, my_criteria){
    return object.filter(function(obj) {
      return Object.keys(my_criteria).every(function(c) {
        return obj[c] == my_criteria[c];
      });
    });  
};


// Function to add option in select
function optionsGenerator(value, text, select) {
    const elMainSelect = document.getElementById(select);
    const elOption = document.createElement('option');
    elOption.text = text;
    elOption.value = value;
    elMainSelect.appendChild(elOption);
};

// Function to add all options in select by API
function addOptionsSelect(url, field, textfield, idField, idSelect) {
fetch(url)
    .then(function(response) {
        return response.json()
    })
    .then(function(json) {
        json.forEach(function(feature, index) {
            // If field as null display id field            
            let fieldSelect = feature[field] ? feature[field] : feature[idField];
            let fieldText = feature[textfield] ? feature[textfield] : fieldSelect;
            // Create select's option for all feature
            optionsGenerator(fieldSelect, fieldText, idSelect)
        });
    });
};

// Add all options for config object
config.forEach(el => addOptionsSelect(el.url, el.field, el.textfield, el.idField, el.idSelect));


// Management of the display of the select Profile
const selectMeasure = document.querySelector('#measureType');
selectMeasure.addEventListener('change', (event) => {
    var value = event.target.value;
    // IF PRF display numProfil information
    if (value == 'PRF') {        
        // Integrate the profile numbers according to the selected site
        const selectSite = document.querySelector('#codeSite');
        selectSite.addEventListener('change', (event) => { 
            // Display PRF select
            document.getElementById('selectProfilId').style.display = "block";
            // Remove options from select
            document.getElementById('numProfil').innerHTML = "";
            document.getElementById('numProfil').required = true;
            const fetchUrl = async () => {
                // Get ID site with code site
                var codeSite = event.target.value;
                let responseSite = await fetch(url + "/maddogapi/site");
                let jsonSite = await responseSite.json();
                // Filter site by code site
                var filtered_jsonSite = find_in_object(JSON.parse(JSON.stringify(jsonSite)), {code_site: codeSite});
                var idSite = filtered_jsonSite[0].id_site;
                // Get Profils for selected site
                let responsePRF = await fetch(url + "/maddogapi/sitemeasureprofil");
                let jsonPRF = await responsePRF.json();
                // Filter profiles by site id
                var filtered_jsonPRF = find_in_object(JSON.parse(JSON.stringify(jsonPRF)), {id_site: idSite});
                // Filter profiles by the type of measurement
                var PRF = find_in_object(filtered_jsonPRF, {id_measure_type: '2'});
                // Display option if not profil
                if (!$.isArray(PRF) ||  !PRF.length){                    
                    optionsGenerator('', "Aucun profil n'est disponible pour le site sélectionné", 'numProfil');
                } else {
                    PRF.forEach(el => optionsGenerator(el.num_profil, el.num_profil, 'numProfil'));
                }                
            }             
            fetchUrl();
        });
    } else {
        document.getElementById('numProfil').required = false;
        document.getElementById('selectProfilId').style.display = "none";
    }
});

// Reset form
function resetForm() {
    document.getElementById("formSuivi").reset();
    document.getElementById("formSuivi").classList.remove('was-validated');
}

// Set csvContent parm if input is valid
function validationFormat() {
    var csvFile = document.getElementById('csvFile');

    // check extension
    var valeur = csvFile.value;
    var extensions = /(\.csv)$/i;
    if (!extensions.exec(valeur)) {
        csvFile.setCustomValidity("Format de fichier non valide, veuillez sélectionner un fichier .csv");
        csvFile.reportValidity();
        csvFile.value = '';
        return ;
    } else {   
        // Read csv file to string
        var files = csvFile.files;
        if (files.length === 0) {
            csvFile.setCustomValidity("Le fichier ne doit pas être vide");
            csvFile.reportValidity();
            return ;
        }
        csvFile.setCustomValidity("");
        var reader = new FileReader();
        reader.onload = function(event) {
            csvContent = event.target.result;
        };
        reader.readAsText(files[0]);
    }
}

// Disabling form submissions if there are invalid fields
(() => {
    'use strict'
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    const formSuivi = document.getElementById("formSuivi");

    formSuivi.addEventListener('submit', event => { 

        event.preventDefault();
        if (!formSuivi.checkValidity()) {           
            event.stopPropagation();
        }else{
            importDataWPS()
        }
        formSuivi.classList.add('was-validated')
    }, false)

})()
