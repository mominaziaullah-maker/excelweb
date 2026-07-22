document.getElementById("loginForm").addEventListener("submit", async (e) => {

e.preventDefault();

const email = document.getElementById("email").value;

const password = document.getElementById("password").value;

try{

const response = await fetch("http://localhost:5000/api/login",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({

email,
password

})

});

const data = await response.json();

if(response.ok){

localStorage.setItem("user",JSON.stringify(data.user));

window.location.href="front.html";

}else{

const error=document.getElementById("error");

error.style.display="block";

error.innerHTML=data.error;

}

}catch{

const error=document.getElementById("error");

error.style.display="block";

error.innerHTML="Cannot connect to server.";

}

});