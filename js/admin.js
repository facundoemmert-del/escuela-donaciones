let objetivos=[];

const form=document.getElementById('objetivoForm');
const lista=document.getElementById('listaObjetivos');

form.addEventListener('submit',e=>{
e.preventDefault();

objetivos.push({
nombre:document.getElementById('nombre').value,
precio:Number(document.getElementById('precio').value),
recaudado:Number(document.getElementById('recaudado').value)
});

form.reset();
render();
});

function render(){
lista.innerHTML='';

objetivos.forEach((o,i)=>{
const div=document.createElement('div');
div.className='card';

div.innerHTML=`
<h3>${o.nombre}</h3>
<p>Precio: $${o.precio.toLocaleString()}</p>
<p>Recaudado: $${o.recaudado.toLocaleString()}</p>
<button onclick="eliminar(${i})">Eliminar</button>
`;

lista.appendChild(div);
});
}

function eliminar(i){
objetivos.splice(i,1);
render();
}
