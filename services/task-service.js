// TaskService - smart task board for ADHD users
// RPC styles used:
//   - Unary:            AddTask, GetTask
//   - Server Streaming: StreamMicroTasks

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const registry = require('../naming/registry');

// Load the proto file - this is the contract for this service
const packageDef = protoLoader.loadSync(
  path.join(__dirname, '../proto/task.proto'),
  { keepCase: true, longs: String, defaults: true, oneofs: true }
);
const taskProto = grpc.loadPackageDefinition(packageDef).task;

// In-memory store - works like a simple database
// Key = task ID, Value = task data object
const taskStore = {};