import os
import json

# JSON data for each project
projects = [
    {
        "Title": "EaseAnnotate",
        "URL": "https://www.easeannotate.com/",
        "Description": "EaseAnnotate is my passion project. We ended up launching this product as SaaS. Our project also got funded by Microsoft for Startups. EaseAnnotate is a document AI tool that can be used for annotating documents as well as for extracting key information from the documents.",
        "Link": "https://www.easeannotate.com/",
        "Technologies": "Nextjs, FastAPI, Pytorch, LLMs",
    },
    {
        "Title": "Receipt Scanner",
        "URL": "https://www.youtube.com/watch?v=ezt5WxrMHlE",
        "Description": "Developed a user-friendly software solution using a Transformer-based architecture with the pretrained LayoutLM model for annotating and training custom models for key information extraction from unstructured text arbitrary keys. Implemented CI/CD pipelines with GitHub Actions and Docker for containerization and deployment.",
        "Link": "https://www.youtube.com/watch?v=ezt5WxrMHlE",
        "Technologies": "Pytorch, FastAPI, Reactjs",
    },
    {
        "Title": "Real-time Text Similarity Matching",
        "URL": "https://github.com/Atomnp/realtime-text-similarity-frontend",
        "Description": "Implemented real-time text similarity matching by generating sentence embeddings. Used various algorithms, including TF-IDF, Average Word Embeddings, Smooth Inverse Frequency (SIF), and BERT for generating sentence embeddings. Used Annoy as vector database to perform an approximate nearest neighbor search on vectors.",
        "Link": "https://github.com/Atomnp/realtime-text-similarity-frontend",
        "Technologies": "Pytorch, Annoy, BERT",
    },
    {
        "Title": "Online Certification System",
        "URL": "https://github.com/Atomnp/certification-system-backend",
        "Description": "Developed and managed an online certification system for LOCUS using Django Framework, OpenCV, and Azure VM (Docker), enabling bulk certificate generation, and automated email distribution. Streamlined certificate management and deployment processes, enhancing scalability and efficiency through containerized deployment on Azure.",
        "Link": "https://github.com/Atomnp/certification-system-backend",
        "Technologies": "Django, OpenCV",
    },
    {
        "Title": "Anubadak: A Simple Interpreter",
        "URL": "https://github.com/Atomnp/Anubadak",
        "Description": "Developed an interpreter for a `B`-like language as an academic project, demonstrating core concepts of Object-Oriented Programming and Theory of Computation. Implemented key compiler design principles such as lexical analysis, semantic analysis, and Abstract Syntax Tree (AST) construction.",
        "Link": "https://github.com/Atomnp/Anubadak",
        "Technologies": "C++",
    },
    {
        "Title": "3D City Modeling",
        "URL": "https://github.com/Atomnp/ComputerGraphicsProject",
        "Description": "Developed a 3D renderer from scratch in C++ using OpenGL and GLSL, capable of rendering models created in Blender. Implemented shading techniques including Gouraud and Phong shading, as well as Phong illumination for realistic rendering effects.",
        "Link": "https://github.com/Atomnp/ComputerGraphicsProject",
        "Technologies": "OpenGl, C++",
    },
    {
        "Title": "Unix Like Shell",
        "URL": "https://github.com/Atomnp/Shell_from_scratch",
        "Description": "Implemented a simple UNIX-like shell in C, utilizing various system calls through the C API. Developed basic shell functionalities such as command execution.",
        "Link": "https://github.com/Atomnp/Shell_from_scratch",
        "Technologies": "C, Linux",
    },
]

# Base directory for the project folders
base_dir = "projects"

# Create base directory if it doesn't exist
if not os.path.exists(base_dir):
    os.makedirs(base_dir)

# Iterate over the projects and create folders with index.md files
for idx, project in enumerate(projects, start=1):
    # Use project title for folder name, sanitize it to be filesystem-friendly
    folder_name = f"{idx:02d}_{project['Title'].replace(' ', '_').replace(':', '').replace('/', '')}"
    folder_path = os.path.join(base_dir, folder_name)

    # Create folder
    os.makedirs(folder_path, exist_ok=True)

    # Create index.md file
    md_content = f"""---
title: {project['Title']}
tags:
  - utils
links:
  - icon: ""
    icon_pack: fab
    name: Website
    url: "{project['URL']}"
---

<p align="center">
<img src="{project['URL']}/img/logo.svg" width="250"/>
</p>

{project['Description']}
"""
    with open(os.path.join(folder_path, "index.md"), "w") as md_file:
        md_file.write(md_content)

print("Folders and markdown files have been created.")
